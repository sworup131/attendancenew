const mongoose = require('mongoose')
const Student = require('../models/student')

async function list() {
  await mongoose.connect('mongodb://localhost:27017/logindb', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })

  const students = await Student.find({}, 'username email').lean()
  console.log('Students:')
  for (const s of students) {
    console.log('-', s.username, '->', s.email || '(no email)')
  }
  process.exit(0)
}

list().catch(err => { console.error(err); process.exit(1) })
