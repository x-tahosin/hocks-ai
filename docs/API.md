# API Reference

## Cloud Functions

### streamChat
- **Method:** POST
- **Body:** `{ messages: Message[], uid: string }`
- **Response:** SSE stream

### chatWithGemini
- **Method:** POST
- **Body:** `{ messages: Message[], uid: string }`
- **Response:** JSON

### generateCode
- **Method:** POST
- **Body:** `{ prompt: string, uid: string }`
- **Response:** JSON
