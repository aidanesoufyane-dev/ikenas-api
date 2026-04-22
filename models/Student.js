/**
 * Modèle Student - Informations spécifiques aux élèves
 * Lié au modèle User et à une classe (ex: 6AP-A)
 */
const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    matricule: {
      type: String,
      unique: true,
      required: [true, 'Le code est requis'],
      trim: true,
    },
    dateOfBirth: {
      type: Date,
      required: [true, 'La date de naissance est requise'],
    },
    gender: {
      type: String,
      enum: ['M', 'F'],
      required: true,
    },
    address: {
      type: String,
      trim: true,
    },
    classe: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'La classe est requise'],
    },
    classOrder: {
      type: Number,
      default: null,
      min: 1,
    },
    parentName: {
      type: String,
      trim: true,
    },
    parentPhone: {
      type: String,
      trim: true,
    },
    enrollmentDate: {
      type: Date,
      default: Date.now,
    },
    transport: {
      status: {
        type: String,
        enum: ['with_transport', 'without_transport', 'pending'],
        default: 'without_transport',
      },
      request: {
        requestedAt: {
          type: Date,
          default: null,
        },
        requestedByRole: {
          type: String,
          enum: ['student', 'admin', null],
          default: null,
        },
        note: {
          type: String,
          trim: true,
          default: '',
        },
      },
      assignment: {
        transport: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Transport',
          default: null,
        },
        stopName: {
          type: String,
          trim: true,
          default: '',
        },
        outboundTime: {
          type: String,
          trim: true,
          default: '',
        },
        returnTime: {
          type: String,
          trim: true,
          default: '',
        },
        assignedAt: {
          type: Date,
          default: null,
        },
      },
      history: [
        {
          status: {
            type: String,
            enum: ['with_transport', 'without_transport', 'pending'],
            required: true,
          },
          reason: {
            type: String,
            trim: true,
            default: '',
          },
          changedAt: {
            type: Date,
            default: Date.now,
          },
          changedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
          },
        },
      ],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index pour optimiser la recherche et la pagination
studentSchema.index({ classe: 1 });
studentSchema.index({ classe: 1, classOrder: 1, createdAt: 1 });
studentSchema.index({ matricule: 1 });
studentSchema.index({ user: 1 });
studentSchema.index({ 'transport.status': 1 });
studentSchema.index({ 'transport.assignment.transport': 1 });
studentSchema.index({ '$**': 'text' }); // Index texte pour recherche dynamique

module.exports = mongoose.model('Student', studentSchema);
