const firebase = require('firebase');
const BusBoy = require('busboy');
const os = require('os');
const fs = require('fs');
const path = require('path');

const { admin } = require('../utils/admin');
const config = require('../utils/config');
const { isEmail, isEmpty } = require('../utils/validators');

firebase.initializeApp(config);

exports.signUp = (req, res) => {
  let userToken, userId;
  const newUser = {
    email: req.body.email,
    password: req.body.password,
    confirmPassword: req.body.confirmPassword,
    handle: req.body.handle,
  };

  let errors = {};
  const noImg = 'no-img.png';

  if (isEmpty(newUser.email)) {
    return (errors.email = 'Must not be empty');
  } else if (!isEmail(newUser.email)) {
    return (errors.email = 'Must be a valid email adress');
  }

  if (isEmpty(newUser.password))
    errors.password = 'Must not be empty';
  if (newUser.password !== newUser.confirmPassword)
    errors.confirmPassword = 'Passwords must match';
  if (isEmpty(newUser.handle)) errors.handle = 'Must not be empty';

  if (Object.keys(errors).length > 0)
    res.status(400).json({ errors });

  admin
    .firestore()
    .doc(`/users/${newUser.handle}`)
    .get()
    .then((doc) => {
      if (doc.exists) {
        return res
          .status(400)
          .json({ handle: 'this handle is already taken' });
      } else {
        return firebase
          .auth()
          .createUserWithEmailAndPassword(
            newUser.email,
            newUser.password,
          );
      }
    })
    .then((data) => {
      userId = data.user.uid;
      return data.user.getIdToken();
    })
    .then((token) => {
      userToken = token;
      const userCredentials = {
        handle: newUser.handle,
        email: newUser.email,
        imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,
        createdAt: new Date().toISOString(),
        userId,
      };
      return admin
        .firestore()
        .doc(`/users/${newUser.handle}`)
        .set(userCredentials);
    })
    .then(() => {
      return res.status(201).json(userToken);
    })
    .catch((err) => {
      console.error(err);
      return res.status(401).json({ error: err.code });
    });
};

exports.signIn = (req, res) => {
  const user = {
    email: req.body.email,
    password: req.body.password,
  };

  let errors = {};

  if (isEmpty(user.email)) errors.email = 'Must not be empty';
  if (isEmpty(user.password)) errors.password = 'Must not be empty';

  if (Object.keys(errors).length > 0)
    res.status(400).json({ errors });

  firebase
    .auth()
    .signInWithEmailAndPassword(user.email, user.password)
    .then((data) => {
      return data.user.getIdToken();
    })
    .then((token) => {
      return res.json(token);
    })
    .catch((err) => {
      console.error(err);
      err.code === 'auth/wrong-password'
        ? res
            .status(403)
            .json({ general: 'Wrong credentials, please try again' })
        : res.status(500).json({ error: err.code });
    });
};

exports.uploadImage = (req, res) => {
  let imageFileName;
  let imageToBeUploaded = {};
  const busboy = new BusBoy({ headers: req.headers });

  busboy.on(
    'file',
    (fieldname, file, filename, encoding, mimetype) => {
      if (mimetype !== 'image/png' && mimetype !== 'image/jpg') {
        return res
          .status(400)
          .json({ error: 'I think this is not an image' });
      }

      const imageExtension = filename.split('.')[
        filename.split('.').length - 1
      ];
      imageFileName = `${Math.round(
        Math.random() * 1000000,
      )}.${imageExtension}`;
      const filepath = path.join(os.tmpdir(), imageFileName);
      imageToBeUploaded = { filepath, mimetype };
      file.pipe(fs.createWriteStream(filepath));
    },
  );

  busboy.on('finish', () => {
    admin
      .storage()
      .bucket()
      .upload(imageToBeUploaded.filepath, {
        resumable: false,
        metadata: {
          metadata: {
            contentType: imageToBeUploaded.mimetype,
          },
        },
      })
      .then(() => {
        const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`;
        return admin
          .firestore()
          .collection('users')
          .doc(`${req.user.handle}`)
          .update({ imageUrl });
      })
      .then(() => {
        return res.json({ message: 'Image uploaded succesfully' });
      })
      .catch((err) => {
        console.error(err);
        return res.status(500).json({ error: err.code });
      });
  });
  busboy.end(req.rawBody);
};

exports.addUserDetails = (req, res) => {
  let userDetails = {};
  const { bio, website, location } = req.body;
  userDetails.location = location;
  userDetails.bio = bio;

  if (website.trim().substring(0, 4)) {
    userDetails.website = `http://${website}`;
  } else userDetails.website = website;

  admin
    .firestore()
    .collection('users')
    .doc(`${req.user.handle}`)
    .update(userDetails)
    .then(() => {
      return res.json({ message: 'Details added succesfully' });
    })
    .catch((err) => {
      return res.status(500).json({ error: err.code });
    });
};

exports.getAuthenticatedUser = (req, res) => {
  let userData = {};

  admin
    .firestore()
    .collection('users')
    .doc(`${req.user.handle}`)
    .get()
    .then((doc) => {
      if (doc.exists) {
        userData.credentials = doc.data();
        return admin
          .firestore()
          .collection('likes')
          .where('userHandle', '==', req.user.handle)
          .get();
      }
    })
    .then((data) => {
      userData.likes = [];
      data.forEach((doc) => {
        userData.likes.push(doc.data());
      });
      return admin
        .firestore()
        .collection('notifications')
        .where('recipient', '==', req.user.handle)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();
    })
    .then((data) => {
      userData.notifications = [];
      data.forEach((doc) => {
        userData.notifications.push({
          recipient: doc.data().recipient,
          sender: doc.data().sender,
          createdAt: doc.data().createdAt,
          screamId: doc.data().screamId,
          type: doc.data().type,
          read: doc.data().read,
          notificationId: doc.id,
        });
      });
      return res.json(userData);
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

exports.getUserDetails = (req, res) => {
  let userData = {};
  admin
    .firestore()
    .doc(`/users/${req.params.handle}`)
    .get()
    .then((doc) => {
      if (doc.exists) {
        userData.user = doc.data();
        return admin
          .firestore()
          .collection('screams')
          .where('userHandle', '==', req.params.handle)
          .orderBy('createdAt', 'desc')
          .get();
      } else {
        return res.status(404).json({ error: 'User not found' });
      }
    })
    .then((data) => {
      userData.screams = [];
      data.forEach((doc) => {
        userData.screams.push({
          body: doc.data().body,
          createdAt: doc.data().createdAt,
          userHandle: doc.data().userHandle,
          userImage: doc.data().userImage,
          likeCount: doc.data().likeCount,
          commentCount: doc.data().commentCount,
          screamIs: doc.id,
        });
      });
      return res.json(userData);
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

exports.markNotificationsRead = (req, res) => {
  let batch = admin.firestore().batch();
  req.body.forEach((notificationId) => {
    const notification = admin
      .firestore()
      .doc(`/notifications/${notificationId}`);
    batch.update(notification, { read: true });
  });
  batch
    .commit()
    .then(() => {
      return res.json({ message: 'notification mark as read' });
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

exports.getUserById = (req, res) => {
  let user = {};
  admin
    .firestore()
    .collection('users')
    .where('userId', '==', req.params.userId)
    .limit(1)
    .get()
    .then((data) => {
      data.forEach((doc) => {
        user = doc.data();
      });
      return res.json(user);
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};
