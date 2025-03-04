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
        this.email = localStorage.getItem('userEmail');
        this.recoveryCode = localStorage.getItem('recoveryCode');
        
        if (!this.userId) {
            // First time user - generate a memorable, user-friendly ID
            const adjectives = ['Happy', 'Lucky', 'Funny', 'Lazy', 'Clever', 'Brave', 'Jolly', 'Fuzzy'];
            const nouns = ['Cat', 'Dog', 'Fox', 'Panda', 'Tiger', 'Bear', 'Lion', 'Wolf'];
            
            const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
            const noun = nouns[Math.floor(Math.random() * nouns.length)];
            const num = Math.floor(Math.random() * 1000);
            
            this.userId = `${adj}${noun}${num}`.toLowerCase();
            localStorage.setItem('userId', this.userId);
        }
        
        if (!this.username) {
            // Create a fun, random Garfield-themed username from the ID parts
            if (this.userId.match(/[a-z]+[a-z]+\d+/)) {
                // Extract parts from the user ID if it matches our pattern
                const match = this.userId.match(/([a-z]+)([a-z]+)(\d+)/);
                if (match) {
                    const adj = match[1].charAt(0).toUpperCase() + match[1].slice(1);
                    const noun = match[2].charAt(0).toUpperCase() + match[2].slice(1);
                    this.username = `${adj} ${noun}`;
                } else {
                    this.username = this.userId;
                }
            } else {
                this.username = this.userId;
            }
            localStorage.setItem('username', this.username);
        }
        
        // Generate a recovery code if one doesn't exist
        if (!this.recoveryCode) {
            this.setRecoveryCode(this._generateRecoveryCode());
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
            
            // Generate a new recovery code for the new user ID
            this.setRecoveryCode(this._generateRecoveryCode());
            
            // Save recovery information to Firebase for future restoration
            await this.db.ref(`users/${this.userId}`).update({
                username: this.username,
                recoveryCode: this.recoveryCode,
                email: this.email,
                updated: firebase.database.ServerValue.TIMESTAMP
            });
            
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
        
        // Update username in Firebase
        try {
            this.db.ref(`users/${this.userId}`).update({
                username: this.username,
                updated: firebase.database.ServerValue.TIMESTAMP
            });
        } catch (error) {
            console.error('Error updating username in Firebase:', error);
        }
        
        return this.username;
    }

    // Get current user info
    getUserInfo() {
        return {
            userId: this.userId,
            username: this.username,
            email: this.email,
            recoveryCode: this.recoveryCode
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

        // Make sure we have a valid comic date format
        if (!comicDate || typeof comicDate !== 'string') {
            console.error('Invalid comic date:', comicDate);
            throw new Error('Invalid comic date format');
        }
        
        const text = commentText.trim();
        if (text.length > 1000) {
            throw new Error('Comment is too long (maximum 1000 characters)');
        }
        
        // Make sure we have a username
        if (!this.username) {
            console.warn('Username not set, using Anonymous');
            this.username = 'Anonymous';
        }

        // Create comment object
        const newComment = {
            username: this.username,
            text,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        
        // If this is a reply, add the parentId
        if (parentId) {
            console.log('Adding reply to comment:', parentId);
            newComment.parentId = parentId;
        }
        
        try {
            console.log('Submitting comment to Firebase:', JSON.stringify(newComment));
            console.log('For comic date:', comicDate);
            
            const commentsRef = this.db.ref(`comments/${comicDate}`);
            const newCommentRef = commentsRef.push(); 
            await newCommentRef.set(newComment);
            
            // Invalidate cache to ensure fresh data on next load
            if (window.commentsCache && window.commentsCache[comicDate]) {
                delete window.commentsCache[comicDate];
            }
            
            console.log('Comment added successfully with ID:', newCommentRef.key);
            return { ...newComment, id: newCommentRef.key };
        } catch (error) {
            console.error('Firebase error adding comment:', error);
            throw new Error(`Failed to add comment: ${error.message}`);
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

    // Add method to set recovery email
    setEmail(email) {
        if (email) {
            this.email = email.trim();
            localStorage.setItem('userEmail', this.email);
        } else {
            this.email = null;
            localStorage.removeItem('userEmail');
        }
        return this.email;
    }

    // Add method to set/generate recovery code
    setRecoveryCode(code) {
        this.recoveryCode = code;
        localStorage.setItem('recoveryCode', code);
        return code;
    }

    // Generate a recovery code
    _generateRecoveryCode() {
        // Create a base64 encoded version of the user ID with some randomness
        const randomStr = Math.random().toString(36).substring(2, 8);
        const baseCode = btoa(`${this.userId}-${randomStr}`).replace(/=/g, '');
        
        // Format it into groups for readability
        let formattedCode = '';
        for (let i = 0; i < baseCode.length; i++) {
            if (i > 0 && i % 4 === 0) formattedCode += '-';
            formattedCode += baseCode[i];
        }
        
        return formattedCode;
    }

    // Restore account from recovery code
    async restoreFromRecoveryCode(code) {
        // First check local storage for this code
        if (code === this.recoveryCode) {
            return { success: true, message: 'Account already active' };
        }
        
        try {
            // Try to find the account in Firebase by recovery code
            const snapshot = await this.db.ref('users').orderByChild('recoveryCode').equalTo(code).once('value');
            const userData = snapshot.val();
            
            if (userData) {
                // Found a match
                const userId = Object.keys(userData)[0];
                const user = userData[userId];
                
                // Update local storage with the recovered user data
                localStorage.setItem('userId', userId);
                localStorage.setItem('username', user.username || userId);
                localStorage.setItem('recoveryCode', code);
                if (user.email) localStorage.setItem('userEmail', user.email);
                
                // Update instance variables
                this.userId = userId;
                this.username = user.username || userId;
                this.email = user.email || null;
                this.recoveryCode = code;
                
                return { success: true, message: 'Account restored successfully' };
            }
            
            // If we didn't find it, treat it as a new account with this recovery code
            // This handles manually entered codes that weren't in our database yet
            try {
                // Extract a user ID from the recovery code if possible
                let newUserId = 'user_' + Math.random().toString(36).substring(2, 10);
                
                // Set this as a new account
                localStorage.setItem('userId', newUserId);
                localStorage.setItem('username', 'Restored User');
                localStorage.setItem('recoveryCode', code);
                
                this.userId = newUserId;
                this.username = 'Restored User';
                this.recoveryCode = code;
                
                // Save this to Firebase for future recovery
                await this.db.ref(`users/${newUserId}`).set({
                    username: this.username,
                    recoveryCode: code,
                    created: firebase.database.ServerValue.TIMESTAMP
                });
                
                return { success: true, message: 'New account created with recovery code' };
            } catch (error) {
                console.error('Error creating new account from code:', error);
                return { success: false, message: 'Failed to create account from code' };
            }
        } catch (error) {
            console.error('Error restoring from recovery code:', error);
            return { success: false, message: 'Failed to restore account' };
        }
    }
}
