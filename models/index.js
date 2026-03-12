// models/index.js
// This file ensures all models are registered with mongoose

const fs = require('fs');
const path = require('path');

// Auto-load all model files in this directory
const basename = path.basename(__filename);

fs.readdirSync(__dirname)
  .filter(file => {
    return (file.indexOf('.') !== 0) && 
           (file !== basename) && 
           (file.slice(-3) === '.js');
  })
  .forEach(file => {
    // Just requiring the file registers the model with mongoose
    require(path.join(__dirname, file));
    console.log(`📦 Model loaded: ${file}`);
  });

console.log('✅ All models registered with Mongoose');