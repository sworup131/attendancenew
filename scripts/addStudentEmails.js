const mongoose = require('mongoose')
const Student = require('../models/student')

async function addEmails() {
  await mongoose.connect('mongodb://localhost:27017/logindb', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })

  console.log('Connected to MongoDB for adding student emails')

  try {
    const students = await Student.find({}).lean()
    for (const s of students) {
      const email = s.email && typeof s.email === 'string' && s.email.trim().length > 0 ? s.email : `${s.username}@gmail.com`
      await Student.updateOne({ _id: s._id }, { $set: { email } })
      console.log('Updated', s.username, '->', email)
    }
    console.log('All students updated')
  } catch (err) {
    console.error('Error updating students:', err)
  } finally {
    process.exit(0)
  }
}

addEmails().catch(err => {
  console.error('Script error', err)
  process.exit(1)
})
