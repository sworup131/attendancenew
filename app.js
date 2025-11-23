const express = require('express')
const qrRoutes = require('./routes/qrcode.js')
const mongoose = require('mongoose')
const session = require('express-session')
const app = express()

//mongodb connect 
mongoose.connect('mongodb://localhost:27017/logindb',{
      useNewUrlParser: true,
      useUnifiedTopology: true
})
.then(()=>{console.log("connection successful")})
.catch(()=>{console.log("!!connection failed!!")})


app.set('view engine','ejs')
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
// session middleware (keeps users logged in across requests)
app.use(session({
    secret: 'replace_this_with_a_secure_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // secure: true requires HTTPS
}))
app.use('/',qrRoutes)


app.listen(3000,()=>{
    console.log("Server running on port 3000")
})