const mongoose = require("mongoose")

//define a schema
const studentSchema = new mongoose.Schema({
    username:{
        type:String,
        required:true
    },
    password:{
        type:String,
        required:true
    }
    ,
    email: {
        type: String,
        required: false,
        unique: false
    }
    ,
    attendance: [
        {
            date: { type: String }, // format: YYYY-MM-DD
            present: { type: Boolean, default: false },
            timestamp: { type: Date }
        }
    ]
})

//exporting the model
module.exports = mongoose.model('Student',studentSchema)