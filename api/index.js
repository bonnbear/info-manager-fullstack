const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3001;

// MongoDB 連線配置
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'infoManagerDB'; // 假設的資料庫名稱
const COLLECTION_NAME = 'entries'; // 假設的集合名稱

let db;

// 連線到 MongoDB Atlas
async function connectDB() {
    if (db) return db;

    if (!MONGODB_URI) {
        console.error("FATAL ERROR: MONGODB_URI is not defined. Please set the environment variable.");
        // 在非生產環境下，可以選擇拋出錯誤或使用模擬資料庫
        if (process.env.NODE_ENV !== 'production') {
            console.warn("Using mock database for local development due to missing MONGODB_URI.");
            return null; // 返回 null 表示連線失敗，但允許應用程式繼續運行（如果後續邏輯有處理）
        }
        throw new Error("MONGODB_URI is not defined.");
    }

    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db(DB_NAME);
        console.log("Successfully connected to MongoDB Atlas!");
        return db;
    } catch (error) {
        console.error("Could not connect to MongoDB Atlas:", error.message);
        throw error;
    }
}

// 中介軟體
app.use(cors()); // 允許跨域
app.use(express.json({ limit: '10mb' })); // 解析 JSON 請求體，並增加圖片大小限制

// 確保在處理請求前連線到資料庫
app.use(async (req, res, next) => {
    try {
        const connectedDb = await connectDB();
        if (!connectedDb && process.env.NODE_ENV === 'production') {
             // 在生產環境中，如果連線失敗，則返回 503
            return res.status(503).json({ message: 'Database connection failed' });
        }
        req.db = connectedDb;
        next();
    } catch (error) {
        // 連線錯誤處理
        res.status(500).json({ message: 'Internal server error during database connection' });
    }
});


// --- API 路由 ---

// GET /api/entries - 獲取所有資料
app.get('/api/entries', async (req, res) => {
    if (!req.db) {
        return res.json([]); // 如果是本地開發且沒有 MONGODB_URI，返回空陣列
    }
    try {
        const entries = await req.db.collection(COLLECTION_NAME).find({}).toArray();
        // 將 MongoDB 的 _id 轉換為前端使用的 id
        const formattedEntries = entries.map(entry => ({
            id: entry._id.toString(),
            ...entry,
            _id: undefined
        }));
        res.json(formattedEntries);
    } catch (error) {
        console.error("Error fetching entries:", error);
        res.status(500).json({ message: 'Error fetching data' });
    }
});

// POST /api/entries - 新增一筆資料
app.post('/api/entries', async (req, res) => {
    if (!req.db) {
        return res.status(500).json({ message: 'Database not connected' });
    }
    try {
        const newEntry = req.body;
        // 移除可能的 id 欄位，讓 MongoDB 自動生成 _id
        delete newEntry.id; 
        
        const result = await req.db.collection(COLLECTION_NAME).insertOne(newEntry);
        
        // 返回新增的資料，並將 _id 轉換為 id
        const createdEntry = {
            id: result.insertedId.toString(),
            ...newEntry
        };
        res.status(201).json(createdEntry);
    } catch (error) {
        console.error("Error creating entry:", error);
        res.status(500).json({ message: 'Error creating data' });
    }
});

// PUT /api/entries/:id - 更新一筆資料
app.put('/api/entries/:id', async (req, res) => {
    if (!req.db) {
        return res.status(500).json({ message: 'Database not connected' });
    }
    const { id } = req.params;
    const updateData = req.body;
    
    // 移除可能的 id 欄位，避免更新
    delete updateData.id; 

    try {
        const result = await req.db.collection(COLLECTION_NAME).updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Entry not found' });
        }
        
        // 獲取更新後的資料並返回
        const updatedEntry = await req.db.collection(COLLECTION_NAME).findOne({ _id: new ObjectId(id) });
        
        if (updatedEntry) {
             const formattedEntry = {
                id: updatedEntry._id.toString(),
                ...updatedEntry,
                _id: undefined
            };
            res.json(formattedEntry);
        } else {
            res.status(404).json({ message: 'Entry not found after update' });
        }

    } catch (error) {
        console.error("Error updating entry:", error);
        // 處理無效的 ObjectId 格式錯誤
        if (error.message.includes('Argument passed in must be a string of 12 bytes or a string of 24 hex characters')) {
            return res.status(400).json({ message: 'Invalid entry ID format' });
        }
        res.status(500).json({ message: 'Error updating data' });
    }
});

// DELETE /api/entries/:id - 刪除一筆資料
app.delete('/api/entries/:id', async (req, res) => {
    if (!req.db) {
        return res.status(500).json({ message: 'Database not connected' });
    }
    const { id } = req.params;

    try {
        const result = await req.db.collection(COLLECTION_NAME).deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Entry not found' });
        }

        res.status(204).send(); // 204 No Content
    } catch (error) {
        console.error("Error deleting entry:", error);
        // 處理無效的 ObjectId 格式錯誤
        if (error.message.includes('Argument passed in must be a string of 12 bytes or a string of 24 hex characters')) {
            return res.status(400).json({ message: 'Invalid entry ID format' });
        }
        res.status(500).json({ message: 'Error deleting data' });
    }
});

// 為了讓 Vercel 能將其作為 Serverless Function 運行
module.exports = app;

// 僅在本地開發時監聽端口
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
      console.log(`Backend server is running on http://localhost:${PORT}`);
  });
}