const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, 'Le prénom est requis'],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, 'Le nom est requis'],
      trim: true,
    },
    employeeId: {
      type: String,
      required: [true, "L'identifiant employé est requis"],
      trim: true,
      unique: true,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    type: {
      type: String,
      enum: ['cashier', 'supervisor', 'reception'],
      required: [true, 'Le type de staff est requis'],
    },
    hasLogin: {
      type: Boolean,
      default: false,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

staffSchema.index({ type: 1, isActive: 1 });
staffSchema.index({ user: 1 });

module.exports = mongoose.model('Staff', staffSchema);