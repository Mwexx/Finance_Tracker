process.on('unhandledRejection', (e) => { console.error('UNHANDLED:', e); process.exit(1); });
process.on('uncaughtException', (e) => { console.error('UNCAUGHT:', e); process.exit(1); });

const mongoose = require('./node_modules/mongoose');
const uri = 'mongodb+srv://stevenmwexx_db_user:DNZ53rN9vD436C71@cluster0.orbcxs0.mongodb.net/finance_tracker?retryWrites=true&w=majority&appName=Cluster0';
console.log('Mongoose version:', mongoose.version);
console.log('Connecting to Atlas (SRV)...');

mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 })
  .then(async () => {
    console.log('CONNECTED! readyState:', mongoose.connection.readyState);
    const M = mongoose.model('TestAtlas', new mongoose.Schema({ x: Number }));
    const doc = await M.create({ x: 42 });
    console.log('INSERT OK:', doc._id.toString());
    await M.deleteOne({ _id: doc._id });
    console.log('CLEANUP OK');
    await mongoose.disconnect();
    console.log('DONE - Atlas works!');
    process.exit(0);
  })
  .catch(e => {
    console.error('CONNECT FAIL:', e.message);
    process.exit(1);
  });
