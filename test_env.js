import 'dotenv/config';
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET');
console.log('Length:', process.env.OPENAI_API_KEY?.length);
