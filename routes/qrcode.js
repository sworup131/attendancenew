const QRcode = require('qrcode')
const express = require('express')
const router = express.Router()
const User = require('../models/student')
const QRCode = require('../models/qrcode')
const Teacher = require('../models/teacher')
const { sendMail } = require('../utils/mailer')

router.get('/',(req,res)=>{
    res.redirect('/login')
})

//show login page
router.get('/login',(req,res)=>{
    res.render('login', { role: 'student' })
})

// admin login page
router.get('/admin/login', (req, res) => {
    res.render('login', { role: 'admin' })
})

// student login page (explicit)
router.get('/student/login', (req, res) => {
    res.render('login', { role: 'student' })
})

//show information page after successful login
router.get('/information',(req,res)=>{
    res.render('information')
})

// admin dashboard (protected)
router.get('/admin/dashboard', (req, res) => {
    if (!req.session || req.session.role !== 'admin' || !req.session.userId) {
        return res.redirect('/admin/login')
    }
    res.render('admin_dashboard', { username: req.session.username })
})

// keep old /admin/panel route as alias
router.get('/admin/panel', (req, res) => {
    return res.redirect('/admin/dashboard')
})

// list students for admin
router.get('/admin/students', async (req, res) => {
    if (!req.session || req.session.role !== 'admin' || !req.session.userId) {
        return res.redirect('/admin/login')
    }
    try {
        // fetch students; include attendance summary
        const students = await User.find({}, 'username attendance').lean()
        res.render('admin_students', { students, username: req.session.username })
    } catch (err) {
        console.error('Failed to load students for admin:', err)
        res.status(500).send('Failed to load students')
    }
})




// reports for admin: show student name and number of absent days
router.get('/admin/reports', async (req, res) => {
    if (!req.session || req.session.role !== 'admin' || !req.session.userId) {
        return res.redirect('/admin/login')
    }
    try {
        // total number of active QR codes (attendance days)
        const totalDays = await QRCode.countDocuments({ isActive: true })

        // load students and compute present count
        const students = await User.find({}, 'username attendance').lean()

        const report = students.map(s => {
            const presentCount = (s.attendance || []).filter(a => a.present).length
            const absent = Math.max(0, totalDays - presentCount)
            return { username: s.username, present: presentCount, absent }
        })

        res.render('admin_reports', { report, totalDays, username: req.session.username })
    } catch (err) {
        console.error('Failed to generate reports:', err)
        res.status(500).send('Failed to generate reports')
    }
})

// Send absence notifications to students who are absent for 3 or more days
router.post('/admin/send-absence-notifications', async (req, res) => {
    if (!req.session || req.session.role !== 'admin' || !req.session.userId) {
        return res.status(403).json({ message: 'Forbidden' })
    }

    try {
        const totalDays = await QRCode.countDocuments({ isActive: true })
        const students = await User.find({}, 'username email attendance').lean()

        const toNotify = students.filter(s => {
            const presentCount = (s.attendance || []).filter(a => a.present).length
            const absent = Math.max(0, totalDays - presentCount)
            return absent >= 3 && s.email
        })

        const results = []
        for (const s of toNotify) {
            const presentCount = (s.attendance || []).filter(a => a.present).length
            const absent = Math.max(0, totalDays - presentCount)

            const subject = `Attendance Notice: ${s.username} — ${absent} Absences`
            const text = `Dear ${s.username},\n\nOur records show that you have been absent for ${absent} day(s). Please contact your instructor if you believe this is incorrect.\n\nRegards,\nAttendance System`
            const html = `<p>Dear ${s.username},</p><p>Our records show that you have been absent for <strong>${absent}</strong> day(s). Please contact your instructor if you believe this is incorrect.</p><p>Regards,<br/>Attendance System</p>`

            try {
                const { info, preview } = await sendMail({ to: s.email, subject, text, html })
                results.push({ username: s.username, email: s.email, status: 'sent', preview: preview || null })
            } catch (err) {
                console.error('Failed to send to', s.email, err)
                results.push({ username: s.username, email: s.email, status: 'error', error: String(err) })
            }
        }

        return res.json({ totalDays, notified: results.length, results })
    } catch (err) {
        console.error('Error sending absence notifications', err)
        return res.status(500).json({ message: 'Failed to send notifications' })
    }
})

// logout (works for both students and admins)
router.get('/logout', (req, res) => {
    // Decide redirect target based on role before destroying session
    const redirectTo = (req.session && req.session.role === 'admin') ? '/admin/login' : '/login'
    if (req.session) {
        req.session.destroy(err => {
            return res.redirect(redirectTo)
        })
    } else {
        return res.redirect(redirectTo)
    }
})

// generate QR code for today's date and render it
router.get('/generate-qr', async (req, res) => {
    try {
        const todayStr = new Date().toISOString().slice(0,10)
        // ensure DB record exists for today's QR
        const qrRecord = await QRCode.findOneAndUpdate(
            { code: todayStr },
            { code: todayStr, description: `Attendance for ${todayStr}`, isActive: true },
            { upsert: true, new: true }
        )

        const dataUrl = await QRcode.toDataURL(todayStr)
        const role = req.session && req.session.role ? req.session.role : 'student'
        res.render('qrcode_display', { dataUrl, date: todayStr, description: qrRecord.description, role })
    } catch (err) {
        console.error('Error generating QR:', err)
        res.status(500).send('Failed to generate QR code')
    }
})

//mark attendance by scanning QR code
router.post('/mark-attendance',async (req,res)=>{
    const {qrData} = req.body
    
    if(!qrData){
        return res.status(400).json({message:"Invalid QR code data"})
    }
    
    try{
        // Require logged-in user (session must be set on login)
        if(!req.session || !req.session.userId){
            return res.status(401).json({message: 'Not authenticated. Please login first.'})
        }

        // Today's date string in YYYY-MM-DD
        const today = new Date()
        const todayStr = today.toISOString().slice(0,10)

        // Accept if qrData exactly equals today's date string
        let validQRCode = null
        if(String(qrData) === todayStr){
            // ensure there's a QRCode record for today (create if needed)
            validQRCode = await QRCode.findOneAndUpdate(
                { code: todayStr },
                { code: todayStr, description: `Attendance for ${todayStr}`, isActive: true },
                { upsert: true, new: true }
            )
        } else {
            // Otherwise, check for a matching active QRCode entry in DB
            validQRCode = await QRCode.findOne({ code: qrData, isActive: true })
        }

        if(!validQRCode){
            return res.status(400).json({message:"Invalid QR code. This QR code is not authorized for attendance."})
        }

        // Mark attendance for the logged-in user
        const student = await User.findById(req.session.userId)
        if(!student){
            return res.status(404).json({message: 'User not found'})
        }

        const dateStr = todayStr
        const existing = student.attendance && student.attendance.find(a => a.date === dateStr)
        if(existing && existing.present){
            return res.status(200).json({message: 'Already marked present for today', timestamp: existing.timestamp || null, alreadyMarked: true})
        }

        const timestamp = new Date()
        if(existing){
            existing.present = true
            existing.timestamp = timestamp
        } else {
            student.attendance = student.attendance || []
            student.attendance.push({ date: dateStr, present: true, timestamp: timestamp })
        }

        await student.save()
        console.log("Marked present:", student.username, dateStr)

        return res.status(200).json({
            message: `Attendance marked successfully!`,
            qrDescription: validQRCode.description,
            timestamp: timestamp
        })

    }catch(err){
        console.log("Error marking attendance:", err)
        res.status(500).json({message:"Failed to mark attendance"})
    }
})

//check username and password
router.post('/login', async (req, res) => {
    const { username, password, role } = req.body

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' })
    }

    try {
        const userRole = role && role === 'admin' ? 'admin' : 'student'

        if (userRole === 'admin') {
            // Authenticate teacher/admin
            const teacher = await Teacher.findOne({ username })
            if (!teacher) return res.status(400).json({ message: 'Admin user not found' })
            if (teacher.password !== password) return res.status(400).json({ message: 'Incorrect password' })

            if (req.session) {
                req.session.userId = teacher._id
                req.session.username = teacher.username
                req.session.role = 'admin'
            }
            return res.redirect('/admin/dashboard')
        } else {
            // Student authentication (existing behavior)
            const user = await User.findOne({ username })
            if (!user) return res.status(400).json({ message: 'User not found' })
            if (user.password !== password) return res.status(400).json({ message: 'Incorrect password' })

            if (req.session) {
                req.session.userId = user._id
                req.session.username = user.username
                req.session.role = 'student'
            }
            return res.redirect('/information')
        }
    } catch (err) {
        console.log('error', err)
        res.status(500).json({ message: 'Server error' })
    }
})


//making qr code
// router.get('/', async(req,res)=>{
//     try{
//         url = await QRcode.toDataURL('www.youtube.com')
//         res.render('login', {qr: url})
//     }
//     catch{
//         console.log("api error")
//     }
// })

// router.post('/login',(req,res)=>{

// })

module.exports = router;