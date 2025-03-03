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
        const snapshot = await this.db.ref(`comments/${comicDate}`).once('value');
        return snapshot.val() || [];
    }

    async addComment(comicDate, commentText) {
        const newComment = {
            username: this.username,
            text: commentText,
            timestamp: firebase.database.ServerValue.TIMESTAMP // Use server timestamp
        };
        const commentsRef = this.db.ref(`comments/${comicDate}`);
        const newCommentRef = commentsRef.push(); // Generate unique key
        await newCommentRef.set(newComment);
        return newComment;
    }

    async cleanupFavorites() {
        return {};
    }
}
