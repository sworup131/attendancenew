const mongoose = require("mongoose")

//define a schema for QR codes
const qrcodeSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true
    },
    description: {
        type: String,
        default: "Attendance QR Code"
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
})

//exporting the model
module.exports = mongoose.model('QRCode', qrcodeSchema)
