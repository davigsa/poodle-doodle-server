const { admin } = require('../utils/admin');

exports.getAllScreams = (req, res) => {
  admin
    .firestore()
    .collection('screams')
    .orderBy('createdAt', 'desc')
    .get()
    .then((data) => {
      let screams = [];
      data.forEach((doc) => {
        screams.push({
          screamId: doc.id,
          body: doc.data().body,
          userHandle: doc.data().userHandle,
          createdAt: doc.data().createdAt,
          likeCount: doc.data().likeCount,
          commentCount: doc.data().commentCount,
          userImage: doc.data().userImage,
        });
      });

      return res.json(screams);
    })
    .catch((err) => console.error(err));
};

exports.createScream = (req, res) => {
  const newScream = {
    body: req.body.body,
    userHandle: req.user.handle,
    userImage: req.user.imageUrl,
    createdAt: new Date().toISOString(),
    likeCount: 0,
    commentCount: 0,
  };

  if (req.body.body.trim() === '')
    res.status(400).json({ body: 'Must not be empty' });

  admin
    .firestore()
    .collection('screams')
    .add(newScream)
    .then((doc) => {
      let resScream = newScream;
      resScream.screamId = doc.id;
      return res.json({
        message: `document ${doc.id} created successfully`,
      });
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: 'Somenthing went wrong' });
    });
};

exports.getScream = (req, res) => {
  let screamData = {};
  admin
    .firestore()
    .collection('screams')
    .doc(`${req.params.screamId}`)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return res.status(404).json({ error: 'Scream not found' });
      }
      screamData = doc.data();
      screamData.screamId = doc.id;
      return admin
        .firestore()
        .collection('comments')
        .orderBy('createdAt', 'desc')
        .where('screamId', '==', req.params.screamId)
        .get();
    })
    .then((data) => {
      screamData.comments = [];
      data.forEach((doc) => {
        screamData.comments.push(doc.data());
      });
      return res.json(screamData);
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

exports.commentOnScream = (req, res) => {
  if (req.body.body.trim() === '')
    res.status(400).json({ comment: 'Must not be empty' });

  let screamData;
  const screamDocument = admin
    .firestore()
    .doc(`/screams/${req.params.screamId}`);
  const newComment = {
    body: req.body.body,
    createdAt: new Date().toISOString(),
    screamId: req.params.screamId,
    userHandle: req.user.handle,
    userImage: req.user.imageUrl,
  };

  screamDocument
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return res
          .status(404)
          .json({ error: 'Scream doesnt exist anymore' });
      }
      screamData = doc.data();
      return admin.firestore().collection('comments').add(newComment);
    })
    .then(() => {
      screamData.commentCount++;
      screamDocument.update({
        commentCount: screamData.commentCount,
      });
      return res.json(newComment);
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

exports.likeScream = (req, res) => {
  const likeDocument = admin
    .firestore()
    .collection('likes')
    .where('userHandle', '==', req.user.handle)
    .where('screamId', '==', req.params.screamId)
    .limit(1);

  const screamDocument = admin
    .firestore()
    .doc(`/screams/${req.params.screamId}`);

  let screamData;
  screamDocument
    .get()
    .then((doc) => {
      if (doc.exists) {
        screamData = doc.data();
        screamData.screamId = doc.id;
        return likeDocument.get();
      } else {
        return res.status(404).json({ error: 'Scream not found' });
      }
    })
    .then((data) => {
      if (data.empty) {
        return admin
          .firestore()
          .collection('likes')
          .add({
            screamId: req.params.screamId,
            userHandle: req.user.handle,
          })
          .then(() => {
            screamData.likeCount++;
            return screamDocument.update({
              likeCount: screamData.likeCount,
            });
          })
          .then(() => {
            return res.json(screamData);
          });
      } else {
        return res
          .status(400)
          .json({ error: 'Scream already liked' });
      }
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

exports.unlikeScream = (req, res) => {
  const likeDocument = admin
    .firestore()
    .collection('likes')
    .where('userHandle', '==', req.user.handle)
    .where('screamId', '==', req.params.screamId)
    .limit(1);

  const screamDocument = admin
    .firestore()
    .doc(`/screams/${req.params.screamId}`);

  let screamData;
  screamDocument
    .get()
    .then((doc) => {
      if (doc.exists) {
        screamData = doc.data();
        screamData.screamId = doc.id;
        return likeDocument.get();
      } else {
        return res.status(404).json({ error: 'Scream not found' });
      }
    })
    .then((data) => {
      if (data.empty) {
        return res.status(400).json({ error: 'Scream not liked' });
      } else {
        return admin
          .firestore()
          .doc(`/likes/${data.docs[0].id}`)
          .delete()

          .then(() => {
            screamData.likeCount--;
            return screamDocument.update({
              likeCount: screamData.likeCount,
            });
          })
          .then(() => {
            return res.json(screamData);
          });
      }
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

exports.deleteScream = (req, res) => {
  const document = admin
    .firestore()
    .doc(`/screams/${req.params.screamId}`);

  document
    .get()
    .then((doc) => {
      const screamData = doc.data();
      if (!doc.exists) {
        return res
          .status(404)
          .json({ error: 'Scream doesnt exists anymore' });
      }
      if (screamData.userHandle !== req.user.handle) {
        return res.status(403).json({ error: 'Unauthorized' });
      } else {
        return document.delete();
      }
    })
    .then(() => {
      return res.json({ message: 'Scream deleted successfully' });
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};
