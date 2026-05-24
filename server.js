const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const RENDER_BACKEND_URL = "https://my-custom-chatbox.onrender.com"; 

let configStorage = { tgToken: '', fbToken: '', fbVerify: '' };
let messageLogs = [];
let userList = [];

app.get('/', (req, res) => {
    res.send('🚀 Chatbox Backend Server အလုပ်လုပ်နေပါပြီ!');
});

app.post('/api/save-config', async (req, res) => {
    const { tgToken, fbToken, fbVerify } = req.body;
    configStorage.tgToken = tgToken;
    configStorage.fbToken = fbToken;
    configStorage.fbVerify = fbVerify;
    
    if (tgToken) {
        try {
            const webhookUrl = `${RENDER_BACKEND_URL}/webhook/telegram`;
            await axios.get(`https://api.telegram.org/bot${tgToken}/setWebhook?url=${webhookUrl}`);
            console.log('✅ Webhook Set Successfully');
        } catch (error) {
            console.error('❌ Webhook Error:', error.message);
        }
    }
    res.sendStatus(200);
});

app.get('/api/messages', (req, res) => {
    res.json({ users: userList, logs: messageLogs });
});

// Admin စာပြန်ပို့လျှင် Unread ကို 0 ပြန်လုပ်ပေးခြင်း
app.post('/api/send-message', async (req, res) => {
    const { text, userId, platform } = req.body;
    messageLogs.push({ userId, text, sender: 'admin', timestamp: new Date() });

    const user = userList.find(u => u.id == userId);
    if (user) {
        user.unread = 0; // စာပြန်လိုက်ပြီမို့ Noti ပိတ်မည်
        user.lastMsg = text;
        user.time = 'Just Now';
        
        // စာပြန်လိုက်တဲ့သူကိုလည်း အပေါ်ဆုံး ရွှေ့ပေးမည်
        userList = [user, ...userList.filter(u => u.id != userId)];
    }

    if (platform === 'Telegram' && configStorage.tgToken) {
        try {
            await axios.post(`https://api.telegram.org/bot${configStorage.tgToken}/sendMessage`, {
                chat_id: userId,
                text: text
            });
        } catch (err) {
            console.error('❌ Error sending msg:', err.message);
        }
    }
    res.sendStatus(200);
});

// စာဖတ်ပြီးကြောင်း/Noti ဖျောက်ကြောင်း API
app.post('/api/mark-read', (req, res) => {
    const { userId } = req.body;
    const user = userList.find(u => u.id == userId);
    if (user) {
        user.unread = 0;
    }
    res.sendStatus(200);
});

app.post('/webhook/telegram', (req, res) => {
    const message = req.body.message;
    if (message) {
        const chatId = message.chat.id;
        const text = message.text || '';
        const firstName = message.chat.first_name || 'Unknown User';
        
        messageLogs.push({ userId: chatId, text, sender: 'user', timestamp: new Date() });

        const userIdx = userList.findIndex(u => u.id == chatId);
        
        if (userIdx !== -1) {
            // ရှိပြီးသားလူဆိုလျှင် Noti Count တိုးပြီး List ရဲ့ အပေါ်ဆုံး (Index 0) သို့ ပို့မည်
            const updatedUser = userList[userIdx];
            updatedUser.lastMsg = text;
            updatedUser.time = 'Just Now';
            updatedUser.unread = (updatedUser.unread || 0) + 1;
            
            userList.splice(userIdx, 1);
            userList.unshift(updatedUser);
        } else {
            // လူသစ်ဆိုလျှင် အပေါ်ဆုံးကနေ တန်းထည့်မည်
            userList.unshift({ 
                id: chatId, 
                name: firstName, 
                platform: 'Telegram', 
                lastMsg: text, 
                gender: 'Not Specified', 
                time: 'Just Now',
                unread: 1 
            });
        }
    }
    res.sendStatus(200);
});

// Messenger Webhook 
app.post('/webhook/messenger', (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        body.entry.forEach(entry => {
            const webhookEvent = entry.messaging[0];
            if (webhookEvent && webhookEvent.message) {
                const senderId = webhookEvent.sender.id;
                const text = webhookEvent.message.text;
                
                messageLogs.push({ userId: senderId, text, sender: 'user', timestamp: new Date() });

                const userIdx = userList.findIndex(u => u.id == senderId);
                if (userIdx !== -1) {
                    const updatedUser = userList[userIdx];
                    updatedUser.lastMsg = text;
                    updatedUser.time = 'Just Now';
                    updatedUser.unread = (updatedUser.unread || 0) + 1;
                    
                    userList.splice(userIdx, 1);
                    userList.unshift(updatedUser);
                } else {
                    userList.unshift({ 
                        id: senderId, 
                        name: `FB User ${senderId.substring(0,5)}`, 
                        platform: 'Messenger', 
                        lastMsg: text, 
                        gender: 'Not Specified', 
                        time: 'Just Now',
                        unread: 1 
                    });
                }
            }
        });
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

app.get('/webhook/messenger', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode && token && mode === 'subscribe' && token === configStorage.fbVerify) {
        res.status(200).send(challenge);
    } else { res.sendStatus(403); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🎯 Server running on port ${PORT}`));
