const mongoose = require('mongoose')
const Teacher = require('../models/teacher')

async function seed() {
  await mongoose.connect('mongodb://localhost:27017/logindb', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })

  console.log('Connected to MongoDB for seeding teachers')

  const teachers = []
  for (let i = 1; i <= 10; i++) {
    teachers.push({ username: `teacher${i}`, password: 'password123' })
  }

  for (const t of teachers) {
    try {
      await Teacher.findOneAndUpdate(
        { username: t.username },
        { $set: t },
        { upsert: true, new: true }
      )
      console.log('Upserted', t.username)
    } catch (err) {
      console.error('Failed to upsert', t.username, err)
    }
  }

  console.log('Seeding complete')
  process.exit(0)
}

seed().catch(err => {
  console.error('Seeding error', err)
  process.exit(1)
})
