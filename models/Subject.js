/**
 * Modèle Subject - Matières enseignées
 * Ex: Mathématiques, Français, Physique-Chimie
 */
const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Le nom de la matière est requis'],
      trim: true,
      unique: true,
    },
    code: {
      type: String,
      trim: true,
      unique: true,
    },
    description: {
      type: String,
      trim: true,
    },
    coefficient: {
      type: Number,
      default: 1,
    },
    classes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

subjectSchema.index({ name: 1 });
subjectSchema.index({ code: 1 });
subjectSchema.index({ classes: 1 });

module.exports = mongoose.model('Subject', subjectSchema);
