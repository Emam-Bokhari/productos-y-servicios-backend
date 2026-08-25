import { io } from "socket.io-client";
import axios from "axios";

const BASE_URL = "http://10.10.7.10:5009";

// Tokens from user logs
const userToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZhNzZlZGRkZGEwMzY1NzkwOWJjYmQ0MyIsInJvbGUiOiJ1c2VyIiwiZW1haWwiOiJzdHVkZW50ZW1hbUBnbWFpbC5jb20iLCJpYXQiOjE3ODcyMTc0NDMsImV4cCI6MTc4OTgwOTQ0M30.OtRKhIO698tOvU8Ug1Xb8hkxGpEbJ0tYzhkKZnqFJ5A";

async function testSockets() {
  console.log("Connecting user socket...");
  
  // Connect as the user (6a76edddda03657909bcbd43)
  // We use the query param with a space to test the robustness fix!
  const userSocket = io(BASE_URL, {
    query: {
      "token ": userToken
    },
    transports: ["websocket"]
  });

  userSocket.on("connect", () => {
    console.log("User socket connected successfully!");
    
    // Listen for newChat events
    const newChatEvent = `newChat::6a76edddda03657909bcbd43`;
    userSocket.on(newChatEvent, (data) => {
      console.log(`\n🎉 Success! Received socket event: '${newChatEvent}'`);
      console.log("Event Data:", JSON.stringify(data, null, 2));
      
      // Clean up and exit
      userSocket.disconnect();
      process.exit(0);
    });
    
    console.log(`Listening for socket event: '${newChatEvent}'`);
    
    // Now trigger the REST API to create a chat
    triggerCreateChat();
  });

  userSocket.on("connect_error", (error) => {
    console.error("User socket connection error:", error.message);
    process.exit(1);
  });
}

async function triggerCreateChat() {
  console.log("Triggering HTTP request to create chat...");
  try {
    const response = await axios.post(
      `${BASE_URL}/api/v1/chats/create-chat`,
      {
        participant: "6a76eaa1e0c04cc25974e04c", // Admin ID
        communicationType: "product",
        referenceId: "66a01f4c7d54023456789abd"
      },
      {
        headers: {
          Authorization: `Bearer ${userToken}`
        }
      }
    );
    console.log("Create Chat API response status:", response.status);
    console.log("Create Chat API Response:", JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.error("Create Chat API Error:", error.response?.data || error.message);
  }
}

testSockets();
