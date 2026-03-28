var express = require("express");
var router = express.Router();
let { uploadImage, uploadExcel } = require('../utils/uploadHandler')
let path = require('path')
let exceljs = require('exceljs')
let categoryModel = require('../schemas/categories')
let productModel = require('../schemas/products')
let inventoryModel = require('../schemas/inventories')
let mongoose = require('mongoose')
let slugify = require('slugify')
const User = require('../schemas/users');
const Role = require('../schemas/roles');
const generateRandomPassword = require('../utils/generatePassword');
const sendPasswordEmail = require('../utils/email');


const getCellValue = (cell) => {
  if (!cell) return '';
  const val = cell.value;
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    if (val.richText) {
      return val.richText.map(t => t.text).join('');
    }
    if (val.text) return val.text;
    if (val.hyperlink) return val.hyperlink;
    if (val.result) return val.result;
    return '';
  }
  return val.toString().trim();
};

router.post('/import_users', uploadExcel.single('file'), async function(req, res, next) {
  if (!req.file) {
    return res.status(400).json({ error: 'Vui lòng upload file Excel' });
  }

  const userRole = await Role.findOne({ name: 'user', isDeleted: false });
  if (!userRole) {
    return res.status(500).json({ error: 'Role "user" không tồn tại. Vui lòng tạo role user trước.' });
  }

  const workbook = new exceljs.Workbook();
  const filePath = path.join(__dirname, '../uploads', req.file.filename);
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];

  const results = { success: [], failed: [] };

  // Duyệt từ dòng 2 (bỏ qua header)
  for (let row = 2; row <= worksheet.rowCount; row++) {
    const contentRow = worksheet.getRow(row);
    const username = getCellValue(contentRow.getCell(1));
    const email = getCellValue(contentRow.getCell(2));

    // Log để kiểm tra (xem trong terminal)
    console.log(`Row ${row}: username="${username}", email="${email}"`);

    if (!username || !email) {
      results.failed.push({ row, error: 'Thiếu username hoặc email' });
      continue;
    }

    try {
      const existing = await User.findOne({ $or: [{ username }, { email }] });
      if (existing) {
        results.failed.push({ username, email, error: 'Username hoặc email đã tồn tại' });
        continue;
      }

      const plainPassword = generateRandomPassword(16);
      const newUser = new User({
        username,
        email,
        password: plainPassword,
        role: userRole._id,
        fullName: '',
        avatarUrl: 'https://i.sstatic.net/l60Hf.png',
        status: false,
        loginCount: 0,
        isDeleted: false
      });

      await newUser.save();
      await sendPasswordEmail(email, username, plainPassword);

      results.success.push({ username, email });
    } catch (err) {
      results.failed.push({ username, email, error: err.message });
    }
  }

  res.status(200).json({
    message: 'Import user hoàn tất',
    results
  });
});

router.get('/:filename', function (req, res, next) {
    let pathFile = path.join(__dirname, '../uploads', req.params.filename)
    res.sendFile(pathFile)
})

router.post('/one_file', uploadImage.single('file'), function (req, res, next) {
    if (!req.file) {
        res.status(404).send({
            message: "file khong duoc de trong"
        })
        return
    }
    res.send({
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size
    })
})
router.post('/multiple_file', uploadImage.array('files'), function (req, res, next) {
    if (!req.files) {
        res.status(404).send({
            message: "file khong duoc de trong"
        })
        return
    }
    res.send(req.files.map(f => {
        return {
            filename: f.filename,
            path: f.path,
            size: f.size
        }
    }))
})
router.post('/excel', uploadExcel.single('file'), async function (req, res, next) {
    //workbook->worksheet->row/column->cell
    let workbook = new exceljs.Workbook();
    let pathFile = path.join(__dirname, '../uploads', req.file.filename)
    await workbook.xlsx.readFile(pathFile);
    let worksheet = workbook.worksheets[0];
    let categories = await categoryModel.find({});
    let categoryMap = new Map()
    for (const category of categories) {
        categoryMap.set(category.name, category._id)
    }
    let products = await productModel.find({});
    let getTitle = products.map(p => p.title)
    let getSku = products.map(p => p.sku)
    let result = [];
    for (let row = 2; row <= worksheet.rowCount; row++) {
        let errorsInRow = [];
        const contentRow = worksheet.getRow(row);
        let sku = contentRow.getCell(1).value;
        let title = contentRow.getCell(2).value;
        let category = contentRow.getCell(3).value;
        let price = Number.parseInt(contentRow.getCell(4).value);
        let stock = Number.parseInt(contentRow.getCell(5).value);
        if (price < 0 || isNaN(price)) {
            errorsInRow.push("price pahi la so duong")
        }
        if (stock < 0 || isNaN(stock)) {
            errorsInRow.push("stock pahi la so duong")
        }
        if (!categoryMap.has(category)) {
            errorsInRow.push("category khong hop le")
        }
        if (getTitle.includes(title)) {
            errorsInRow.push("Title da ton tai")
        }
        if (getSku.includes(sku)) {
            errorsInRow.push("sku da ton tai")
        }
        if (errorsInRow.length > 0) {
            result.push(errorsInRow)
            continue;
        }
        let session = await mongoose.startSession();
        session.startTransaction()
        try {
            let newProduct = new productModel({
                sku: sku,
                title: title,
                slug: slugify(title,
                    {
                        replacement: '-',
                        remove: undefined,
                        lower: true,
                        trim: true
                    }
                ), price: price,
                description: title,
                category: categoryMap.get(category)
            })
            await newProduct.save({ session });

            let newInventory = new inventoryModel({
                product: newProduct._id,
                stock: stock
            })
            await newInventory.save({ session });
            await newInventory.populate('product')
            await session.commitTransaction()
            await session.endSession()
            getTitle.push(newProduct.title)
            getSku.push(newProduct.sku)
            result.push(newInventory)
        } catch (error) {
            await session.abortTransaction()
            await session.endSession()
            res.push(error.message)
        }

    }
    res.send(result)
})

module.exports = router