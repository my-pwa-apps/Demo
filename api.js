/**
 * ComicsAPI - Simple storage system using localStorage
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
        
        // Load any shared comments from localStorage
        this.sharedCommentsKey = 'garfield-shared-comments';
        this.loadSharedComments();
        
        // Simulate loading shared comments from other users (demo purpose)
        this.simulateSharedComments();
    }
    
    // Load the shared comments pool
    loadSharedComments() {
        try {
            this.sharedComments = JSON.parse(localStorage.getItem(this.sharedCommentsKey)) || {};
        } catch (e) {
            console.error('Error parsing shared comments', e);
            this.sharedComments = {};
        }
    }
    
    // Save shared comments pool
    saveSharedComments() {
        localStorage.setItem(this.sharedCommentsKey, JSON.stringify(this.sharedComments));
    }
    
    // For demo: Simulate comments from other users
    simulateSharedComments() {
        const randomUsernames = [
            'GarfieldFan42', 'LasagnaLover', 'OdieFriend', 'JonArbuckle', 
            'ComicReader', 'MondayHater', 'CatLover99'
        ];
        
        const sampleComments = [
            "I love this comic! Classic Garfield.",
            "Mondays, am I right?",
            "Lasagna time!",
            "Poor Jon...",
            "Reminds me of my cat!",
            "Garfield is such a mood.",
            "This one always makes me laugh.",
            "Share if you hate Mondays too!",
            "Odie deserved that one.",
            "Nermal is so annoying."
        ];
        
        // Add some initial comments if none exist
        if (Object.keys(this.sharedComments).length === 0) {
            // Add comments to some random dates
            const dates = [
                '2023/01/15', '2023/02/20', '2023/03/10', 
                '2022/12/25', '2022/11/11', '2022/10/31'
            ];
            
            dates.forEach(date => {
                if (!this.sharedComments[date]) {
                    this.sharedComments[date] = [];
                }
                
                // Add 1-3 random comments per date
                const commentCount = Math.floor(Math.random() * 3) + 1;
                for (let i = 0; i < commentCount; i++) {
                    const randomUsername = randomUsernames[Math.floor(Math.random() * randomUsernames.length)];
                    const randomComment = sampleComments[Math.floor(Math.random() * sampleComments.length)];
                    
                    this.sharedComments[date].push({
                        username: randomUsername,
                        text: randomComment,
                        timestamp: new Date(Date.now() - Math.random() * 10000000).toISOString()
                    });
                }
            });
            
            this.saveSharedComments();
        }
    }

    async getFavorites() {
        return JSON.parse(localStorage.getItem('favorites')) || {};
    }

    async addFavorite(comicData) {
        const favorites = await this.getFavorites();
        favorites[comicData.date] = {
            date: comicData.date,
            src: comicData.src,
            added: new Date().toISOString()
        };
        localStorage.setItem('favorites', JSON.stringify(favorites));
        return favorites[comicData.date];
    }

    async removeFavorite(comicDate) {
        try {
            const favorites = await this.getFavorites();
            
            // If we have an exact match, delete it
            if (favorites[comicDate]) {
                delete favorites[comicDate];
            } else {
                // Try different date formats
                const dateWithSlash = comicDate.includes('/') ? comicDate : comicDate.replace(/-/g, '/');
                const dateWithDash = comicDate.includes('-') ? comicDate : comicDate.replace(/\//g, '-');
                
                delete favorites[dateWithSlash];
                delete favorites[dateWithDash];
            }
            
            localStorage.setItem('favorites', JSON.stringify(favorites));
            return true;
        } catch (error) {
            console.error('Error removing favorite:', error);
            return false;
        }
    }

    // Add a method to clean up all problematic favorites
    async cleanupFavorites() {
        try {
            const favorites = await this.getFavorites();
            const cleanFavorites = {};
            
            // Only keep favorites with valid dates and images
            Object.entries(favorites).forEach(([key, fav]) => {
                // Skip entries with invalid dates or missing required properties
                if (!fav || !fav.date || !fav.src || fav.date === 'Invalid Date') {
                    return;
                }
                
                try {
                    // Normalize the date to avoid format issues
                    const parsedDate = new Date(fav.date);
                    if (isNaN(parsedDate.getTime())) return; // Skip invalid dates
                    
                    // Use a consistent date format as the key
                    const year = parsedDate.getFullYear();
                    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
                    const day = String(parsedDate.getDate()).padStart(2, '0');
                    const normalizedKey = `${year}-${month}-${day}`;
                    
                    cleanFavorites[normalizedKey] = {
                        ...fav,
                        date: normalizedKey
                    };
                } catch (e) {
                    // Skip any entries that cause errors
                    console.warn('Skipping invalid favorite:', key);
                }
            });
            
            localStorage.setItem('favorites', JSON.stringify(cleanFavorites));
            return cleanFavorites;
        } catch (error) {
            console.error('Error cleaning up favorites:', error);
            return {};
        }
    }

    async getComments(comicDate) {
        // Refresh shared comments from local storage (simulates getting fresh data)
        this.loadSharedComments();
        return this.sharedComments[comicDate] || [];
    }

    async addComment(comicDate, commentText) {
        // Refresh from localStorage first (simulates checking for new comments)
        this.loadSharedComments();
        
        if (!this.sharedComments[comicDate]) {
            this.sharedComments[comicDate] = [];
        }
        
        const newComment = {
            username: this.username,
            text: commentText,
            timestamp: new Date().toISOString()
        };
        
        this.sharedComments[comicDate].push(newComment);
        this.saveSharedComments();
        
        return newComment;
    }
}
