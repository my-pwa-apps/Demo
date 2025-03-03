const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Simplify the initialization - don't hardcode credentials
admin.initializeApp();

// Simple test function
exports.helloWorld = functions.https.onCall((data, context) => {
  return { message: "Hello from Firebase!" };
});

// Your existing functions
exports.addComment = functions.https.onCall(async (data, context) => {
  const { comicDate, commentText, username, parentId } = data;

  if (!comicDate || !commentText || !username) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters.');
  }

  const newComment = {
    username: username,
    text: commentText,
    timestamp: admin.database.ServerValue.TIMESTAMP // Use server timestamp
  };
  
  // Add parentId if this is a reply
  if (parentId) {
    newComment.parentId = parentId;
  }

  try {
    const ref = admin.database().ref(`comments/${comicDate}`).push();
    await ref.set(newComment);
    return { success: true, commentId: ref.key };
  } catch (error) {
    console.error("Error adding comment:", error);
    throw new functions.https.HttpsError('internal', 'Failed to add comment.');
  }
});

exports.getComments = functions.https.onCall(async (data, context) => {
  const { comicDate } = data;

  if (!comicDate) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing comicDate parameter.');
  }

  try {
    const snapshot = await admin.database().ref(`comments/${comicDate}`).once('value');
    const comments = snapshot.val() || {};
    // Convert object to array for easier handling on the client
    const commentsArray = Object.entries(comments).map(([key, value]) => ({ id: key, ...value }));
    return { success: true, comments: commentsArray };
  } catch (error) {
    console.error("Error getting comments:", error);
    throw new functions.https.HttpsError('internal', 'Failed to get comments.');
  }
});

exports.addFavorite = functions.https.onCall(async (data, context) => {
  const { comicData, username } = data;
  if (!comicData || !username) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters.');
  }

  try {
    const favRef = admin.database().ref(`favorites/${username}/${comicData.date}`);
    await favRef.set({
      date: comicData.date,
      src: comicData.src,
      added: admin.database.ServerValue.TIMESTAMP
    });
    return { success: true };
  } catch (error) {
    console.error("Error adding favorite:", error);
    throw new functions.https.HttpsError('internal', 'Failed to add favorite.');
  }
});

exports.getFavorites = functions.https.onCall(async (data, context) => {
  const { username } = data;
  if (!username) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing username parameter.');
  }
  try {
    const snapshot = await admin.database().ref(`favorites/${username}`).once('value');
    return snapshot.val() || {};
  } catch (error) {
    console.error("Error getting favorites:", error);
    throw new functions.https.HttpsError('internal', 'Failed to get favorites.');
  }
});

exports.removeFavorite = functions.https.onCall(async (data, context) => {
  const { comicDate, username } = data;
  if (!comicDate || !username) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters.');
  }
  try {
    await admin.database().ref(`favorites/${username}/${comicDate}`).remove();
    return { success: true };
  } catch (error) {
    console.error("Error removing favorite:", error);
    throw new functions.https.HttpsError('internal', 'Failed to remove favorite.');
  }
});
