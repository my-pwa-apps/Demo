/**
 * ComicsAPI - Firebase storage system
 */
class ComicsAPI {
    constructor() {
        this.db = firebase.database();
        this.auth = firebase.auth();
        
        // Initialize user info
        this._initUser();
    }

    async _initUser() {
        // Check for existing user ID in localStorage
        this.userId = localStorage.getItem('userId');
        this.username = localStorage.getItem('username');
        
        if (!this.userId) {
            // First time user - generate anonymous ID
            this.userId = 'user_' + Math.random().toString(36).substring(2, 15);
            localStorage.setItem('userId', this.userId);
        }
        
        if (!this.username) {
            // Create a fun, random Garfield-themed username
            const adjectives = ['Lazy', 'Hungry', 'Sleepy', 'Grumpy', 'Happy', 'Silly', 'Fluffy', 'Orange'];
            const nouns = ['Cat', 'Lasagna', 'Napper', 'Monday-Hater', 'Friend', 'Garfield', 'Paws'];
            const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
            const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
            this.username = `${randomAdjective}${randomNoun}${Math.floor(Math.random() * 1000)}`;
            localStorage.setItem('username', this.username);
        }
    }

    // Set a user ID to enable cross-device sync
    async setUserId(userId) {
        if (!userId || userId.trim() === '') {
            throw new Error('Invalid user ID');
        }
        
        try {
            const oldUserId = this.userId;
            this.userId = userId.trim();
            localStorage.setItem('userId', this.userId);
            
            // If the user has favorites under the old ID, migrate them
            if (oldUserId && oldUserId !== this.userId) {
                const oldFavorites = await this.db.ref(`favorites/${oldUserId}`).once('value');
                const oldFavoritesData = oldFavorites.val() || {};
                
                if (Object.keys(oldFavoritesData).length > 0) {
                    // Copy to new ID
                    await this.db.ref(`favorites/${this.userId}`).update(oldFavoritesData);
                }
            }
            
            return this.userId;
        } catch (error) {
            console.error('Error setting user ID:', error);
            throw error;
        }
    }
    
    // Set a custom username
    setUsername(username) {
        if (!username || username.trim() === '') {
            throw new Error('Invalid username');
        }
        
        this.username = username.trim();
        localStorage.setItem('username', this.username);
        return this.username;
    }

    // Get current user info
    getUserInfo() {
        return {
            userId: this.userId,
            username: this.username
        };
    }

    // Optimized favorites methods with error handling
    async getFavorites() {
        try {
            const snapshot = await this.db.ref(`favorites/${this.userId}`).once('value');
            return snapshot.val() || {};
        } catch (error) {
            console.error('Error fetching favorites:', error);
            return {}; // Return empty object on error
        }
    }

    async addFavorite(comicData) {
        try {
            const formattedDate = comicData.date;
            const favRef = this.db.ref(`favorites/${this.userId}/${formattedDate}`);
            await favRef.set({
                date: comicData.date,
                src: comicData.src,
                added: new Date().toISOString()
            });
            return comicData;
        } catch (error) {
            console.error('Error adding favorite:', error);
            throw error;
        }
    }

    async removeFavorite(comicDate) {
        try {
            await this.db.ref(`favorites/${this.userId}/${comicDate}`).remove();
            return true;
        } catch (error) {
            console.error('Error removing favorite:', error);
            return false;
        }
    }

    // Improved comments methods
    // Optimize comment retrieval with caching
    async getComments(comicDate) {
        console.log('Fetching comments for date:', comicDate);
        try {
            // Check memory cache first for better performance
            if (window.commentsCache && window.commentsCache[comicDate]) {
                const cachedTimestamp = window.commentsCache[comicDate].timestamp;
                const currentTime = Date.now();
                // Use cache if it's less than 30 seconds old
                if (currentTime - cachedTimestamp < 30000) {
                    console.log('Using cached comments');
                    return window.commentsCache[comicDate].data;
                }
            }
            
            // If not cached, fetch from Firebase
            const snapshot = await this.db.ref(`comments/${comicDate}`).once('value');
            const commentsObj = snapshot.val() || {};
            
            // Convert object to array
            const commentsArray = Object.entries(commentsObj).map(([id, comment]) => ({
                id,
                ...comment
            }));
            
            // Cache the result
            if (!window.commentsCache) window.commentsCache = {};
            window.commentsCache[comicDate] = {
                data: commentsArray,
                timestamp: Date.now()
            };
            
            return commentsArray;
        } catch (error) {
            console.error('Error fetching comments:', error);
            return []; // Return empty array on error
        }
    }

    // Improve comment adding with better validation and error handling
    async addComment(comicDate, commentText, parentId = null) {
        if (!commentText || !commentText.trim()) {
            throw new Error('Comment cannot be empty');
        }
        
        const text = commentText.trim();
        if (text.length > 1000) {
            throw new Error('Comment is too long (maximum 1000 characters)');
        }
        
        const newComment = {
            username: this.username || 'Anonymous',
            text,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        
        // If this is a reply, add the parentId
        if (parentId) {
            newComment.parentId = parentId;
        }
        
        try {
            const commentsRef = this.db.ref(`comments/${comicDate}`);
            const newCommentRef = commentsRef.push(); 
            await newCommentRef.set(newComment);
            
            // Invalidate cache to ensure fresh data on next load
            if (window.commentsCache && window.commentsCache[comicDate]) {
                delete window.commentsCache[comicDate];
            }
            
            return { ...newComment, id: newCommentRef.key };
        } catch (error) {
            console.error('Error adding comment:', error);
            throw error;
        }
    }

    async deleteComment(comicDate, commentId) {
        try {
            await this.db.ref(`comments/${comicDate}/${commentId}`).remove();
            return true;
        } catch (error) {
            console.error('Error deleting comment:', error);
            throw error;
        }
    }
}
