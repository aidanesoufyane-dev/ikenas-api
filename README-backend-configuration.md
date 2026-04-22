# Backend Configuration and Setup Guide

## Requirements
- Node.js (v16+)
- MongoDB
- Git

## Installation & Setup

1. **Install Dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

2. **Environment Variables (.env)**
   Create a `.env` file in the root directory and configure the following variables:
   ```env
   PORT=5000
   MONGO_URI=mongodb://localhost:27017/school_management
   JWT_SECRET=your_jwt_secret_key_here
   
   # Firebase Cloud Messaging (FCM) Configuration for Push Notifications
   FIREBASE_PROJECT_ID=your-firebase-project-id
   FIREBASE_CLIENT_EMAIL=your-firebase-client-email
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYourKeyHere\n-----END PRIVATE KEY-----\n"
   ```

3. **Firebase Setup for Push Notifications**
   - Go to the Firebase Console and create a project.
   - Under Project Settings > Service Accounts, generate a new private key.
   - Copy the `project_id`, `client_email`, and `private_key` into your `.env` file.
   - *Note: Ensure your `private_key` retains the `\n` newline characters.*

4. **Running the Server**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

## Implementations Needed On Your End

Several backend features require specific data models and frontend coordination:

- **FCM Integration:** The frontend must generate a Firebase device token and send it to the new `POST /api/users/fcm-token` endpoint upon login or app launch.
- **Transport/Bus Tracking:** To power GPS tracking, you need hardware or an app script on the bus pushing coordinates to the new `POST /api/transport/location` endpoint. The frontend will then query `GET /api/transport/location`.
- **Behavior/Discipline:** The `Behavior` model has been initiated, but you should verify `GET /api/behavior/summary` works with your exact frontend data structure.
- **Event RSVPs:** The `POST /api/events/:id/respond` route expects a payload like `{ response: "Attending" }`. Update your frontend UI to send this when appropriate.

## Changes Made to Address the Issues

1. **Missing Submission Status in Assignment List:** Updated `assignmentController.js` to cross-reference the `Submission` database to set `status: 'done'`.
2. **Student's Own Replies Not Visible:** Updated `messageController.js` `$or` filter to include `{ sender: user.id }`.
3. **Sender Avatar Not Included:** Added `avatar` to `.populate('sender', '...')` and `.populate('targetUser', '...')` everywhere.
4. **Reply Creates allowReply: false:** Updated `Message.create` so replies have `allowReply: true`, and added threading logic.
5. **No allowReply Expiration Mechanism:** Added `replyExpiresAt` logic checking to `Message.js` model and controllers.
6. **Sender fullName Virtual:** (No action needed, JSON stringifies virtuals).
7. **Socket.io Reconnections:** Ensured that `socketHandler.js` handles room rejoins on reconnects properly.
8. **Profile-Update Endpoint:** Added `PUT /api/users/profile` in `authRoutes.js/authController.js` to handle avatars and basic details.
9. **Firebase Cloud Messaging:** Installed `firebase-admin`, added `fcmTokens: [String]` to the `User` schema, and modified `utils/notify.js`.
10. **Transport Tracking:** Scaffolded `GET /api/transport/location` endpoints.
11. **Behavior/Discipline Endpoints:** Created basic REST endpoints for behaviors.
12. **Event/News Responses:** Added `POST /api/news/:id/respond`.
13. **Teacher Dashboard Stats:** Updated `getClassStats` to merge `NoteEntry` and `ExamResult` models and output data series correctly!


## 14. Single Notification Read Request Clears ALL Notifications
- **Status:** Resolved
- **Action Taken:** Updated markAsRead in 
otificationController.js. It now checks for the presence of a single ID via eq.body.id, wrapping it in an array mapping down eq.body.ids. This prevents the else block (which equates to mark all as read) from accidentally erasing all unread states.

## 15. Delete Notification Endpoints Completely Missing
- **Status:** Resolved
- **Action Taken:** Created two new endpoints (DELETE /api/notifications/:id and DELETE /api/notifications). Due to the multi-recipient broadcast nature of notifications (like class level), personal notifications execute deleteOne() while broadcast notifications append the user's ID to a new hiddenBy array, hiding it from their view locally.

## 16. RSVP/Response Missing for "News" Posts
- **Status:** Resolved
- **Action Taken:** Copied the RSVP mechanisms into 
ewsController.js and defined the POST /api/news/:id/respond route, so news posts can be treated as interactive widgets similar to general events.

