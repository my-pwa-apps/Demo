/**
 * ComicsAPI - Firebase storage system
 */
class ComicsAPI {
    constructor() {
        // Generate a persistent username for this user
        this.username = localStorage.getItem('username');
        if (!this.username) {
            // Create a fun, random Garfield-themed username
            const adjectives = ['Lazy', 'Hungry', 'Sleepy', 'Grumpy', 'Happy', 'Silly', 'Fluffy', 'Orange'];
            const nouns = ['Cat', 'Lasagna', 'Napper', 'Monday-Hater', 'Friend', 'Garfield', 'Paws'];
            const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
            const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
            this.username = `${randomAdjective}${randomNoun}${Math.floor(Math.random() * 1000)}`;
            localStorage.setItem('username', this.username);
        }
        this.db = firebase.database();
    }

    async getFavorites() {
        const snapshot = await this.db.ref(`favorites/${this.username}`).once('value');
        return snapshot.val() || {};
    }

    async addFavorite(comicData) {
        const formattedDate = comicData.date;
        const favRef = this.db.ref(`favorites/${this.username}/${formattedDate}`);
        await favRef.set({
            date: comicData.date,
            src: comicData.src,
            added: new Date().toISOString()
        });
        return comicData;
    }

    async removeFavorite(comicDate) {
        try {
            await this.db.ref(`favorites/${this.username}/${comicDate}`).remove();
            return true;
        } catch (error) {
            console.error('Error removing favorite:', error);
            return false;
        }
    }

    async getComments(comicDate) {
        console.log('Fetching comments for date:', comicDate);
        const snapshot = await this.db.ref(`comments/${comicDate}`).once('value');
        const commentsObj = snapshot.val() || {};
        console.log('Raw comments data:', commentsObj);
        
        // Convert object to array
        const commentsArray = Object.entries(commentsObj).map(([id, comment]) => ({
            id,
            ...comment
        }));
        
        console.log('Processed comments array:', commentsArray);
        return commentsArray;
    }

    async addComment(comicDate, commentText) {
        console.log('Adding comment for date:', comicDate, 'Text:', commentText);
        const newComment = {
            username: this.username,
            text: commentText,
            timestamp: firebase.database.ServerValue.TIMESTAMP // Use server timestamp
        };
        console.log('New comment object:', newComment);
        
        const commentsRef = this.db.ref(`comments/${comicDate}`);
        const newCommentRef = commentsRef.push(); // Generate unique key
        
        console.log('Comment will be saved at path:', `comments/${comicDate}/${newCommentRef.key}`);
        await newCommentRef.set(newComment);
        
        console.log('Comment added successfully with key:', newCommentRef.key);
        return newComment;
    }

    async deleteComment(comicDate, commentId) {
        console.log('Deleting comment:', commentId, 'from date:', comicDate);
        try {
            await this.db.ref(`comments/${comicDate}/${commentId}`).remove();
            console.log('Comment deleted successfully');
            return true;
        } catch (error) {
            console.error('Error deleting comment:', error);
            throw error;
        }
    }

    async cleanupFavorites() {
        return {};
    }
}
