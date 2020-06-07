const { firestore, https } = require('firebase-functions');
const express = require('express');

const { admin } = require('./utils/admin');

const {
  signUp,
  signIn,
  uploadImage,
  addUserDetails,
  getAuthenticatedUser,
  getUserDetails,
  markNotificationsRead,
} = require('./controllers/user');
const {
  getAllScreams,
  createScream,
  getScream,
  commentOnScream,
  likeScream,
  unlikeScream,
  deleteScream,
} = require('./controllers/screams');
const fbAuth = require('./utils/fbAuth');

const app = express();

//SCREAMS ROUTES
app.get('/screams', getAllScreams);
app.post('/scream', fbAuth, createScream);
app.get('/scream/:screamId', getScream);
app.post('/scream/:screamId/comment', fbAuth, commentOnScream);
app.get('/scream/:screamId/like', fbAuth, likeScream);
app.get('/scream/:screamId/unlike', fbAuth, unlikeScream);
app.delete('/scream/:screamId', fbAuth, deleteScream);

//USERS ROUTES
app.post('/signup', signUp);
app.post('/signin', signIn);
app.post('/user/image', fbAuth, uploadImage);
app.post('/user', fbAuth, addUserDetails);
app.get('/user', fbAuth, getAuthenticatedUser);
app.get('/user/:handle', getUserDetails);
app.post('/notifications', fbAuth, markNotificationsRead);

exports.api = https.onRequest(app);

exports.createNotificationOnLike = firestore
  .document('likes/{id}')
  .onCreate((snapshot) => {
    const snapshotData = snapshot.data();
    admin
      .firestore()
      .doc(`/screams/${snapshotData.screamId}`)
      .get()
      .then((doc) => {
        const docData = doc.data();
        if (
          doc.exists &&
          docData.userHandle !== snapshotData.userHandle
        ) {
          return admin
            .firestore()
            .doc(`/notifications/${snapshot.id}`)
            .set({
              createdAt: new Date().toISOString(),
              sender: snapshotData.userHandle,
              recipient: docData.userHandle,
              type: 'like',
              read: false,
              screamId: doc.id,
            });
        }
      })
      .catch((err) => console.error(err));
  });

exports.deleteNotificationsOnUnlike = firestore
  .document('likes/{id}')
  .onDelete((snapshot) => {
    admin
      .firestore()
      .doc(`/notifications/${snapshot.id}`)
      .delete()
      .catch((err) => console.error(err));
  });

exports.createNotificationOnComment = firestore
  .document('comments/{id}')
  .onCreate((snapshot) => {
    const snapshotData = snapshot.data();

    admin
      .firestore()
      .doc(`/screams/${snapshotData.screamId}`)
      .get()
      .then((doc) => {
        const docData = doc.data();
        if (
          doc.exists &&
          docData.userHandle !== snapshotData.userHandle
        ) {
          return admin
            .firestore()
            .doc(`/notifications/${snapshot.id}`)
            .set({
              createdAt: new Date().toISOString(),
              sender: snapshotData.userHandle,
              recipient: docData.userHandle,
              type: 'comment',
              read: false,
              screamId: doc.id,
            });
        }
      })
      .catch((err) => console.error(err));
  });

exports.onUserImageChanges = firestore
  .document('/users/{userId}')
  .onUpdate((change) => {
    const after = change.after.data();
    const before = change.before.data();
    if (before.imageUrl !== after.imageUrl) {
      const batch = admin.firestore().batch();
      return admin
        .firestore()
        .collection('screams')
        .where('userHandle', '==', before.handle)
        .get()
        .then((data) => {
          data.forEach((doc) => {
            const scream = admin
              .firestore()
              .doc(`/screams/${doc.id}`);
            batch.update(scream, { userImage: after.imageUrl });
          });
          return batch.commit();
        });
    } else {
      return true;
    }
  });

exports.onScreamDeleted = firestore
  .document('/screams/{screamId}')
  .onDelete((snapshot, context) => {
    const screamId = context.params.screamId;
    const batch = admin.firestore().batch();
    return admin
      .firestore()
      .collection('comments')
      .where('screamId', '==', screamId)
      .get()
      .then((data) => {
        data.forEach((doc) => {
          batch.delete(admin.firestore().doc(`/comments/${doc.id}`));
        });
        return admin
          .firestore()
          .collection('likes')
          .where('screamId', '==', screamId)
          .get();
      })
      .then((data) => {
        data.forEach((doc) => {
          batch.delete(admin.firestore().doc(`/comments/${doc.id}`));
        });
        return admin
          .firestore()
          .collection('notifications')
          .where('screamId', '==', screamId)
          .get();
      })
      .then((data) => {
        data.forEach((doc) => {
          batch.delete(
            admin.firestore().doc(`/notifications/${doc.id}`),
          );
        });
        return batch.commit();
      })
      .catch((err) => {
        console.error(err);
      });
  });
