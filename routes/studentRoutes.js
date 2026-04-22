/**
 * Routes Élèves
 */
const express = require('express');
const router = express.Router();
const {
  createStudent, getStudents, getStudent, updateStudent, deleteStudent,
  uploadPhoto, importStudents,
} = require('../controllers/studentController');
const { protect, roleCheck } = require('../middleware/auth');
const { uploadAvatar, uploadExcel } = require('../middleware/upload');

// Import en masse (must be before /:id to avoid conflict)
router.post('/import', protect, roleCheck('admin'), uploadExcel.single('file'), importStudents);

router
  .route('/')
  .get(protect, roleCheck('admin', 'teacher', 'reception'), getStudents)
  .post(protect, roleCheck('admin'), createStudent);

router
  .route('/:id')
  .get(protect, roleCheck('admin'), getStudent)
  .put(protect, roleCheck('admin'), updateStudent)
  .delete(protect, roleCheck('admin'), deleteStudent);

// Photo upload
router.put('/:id/photo', protect, roleCheck('admin'), uploadAvatar.single('avatar'), uploadPhoto);

module.exports = router;
