var FirebaseSearch = require('./firebase-search.js');
var firebase = require('firebase');
var axios = require('axios');
var _ = require('lodash');

firebase.initializeApp({
  "databaseURL": "https://quiver-firebase-search-ad877.firebaseio.com",
  "serviceAccount": "./service-account.json"
});

var proverbsRef = firebase.database().ref('kapakolsun/proverbs');
var elasticsearchConfig = {
    host: '10.128.0.2:9200',
    log: 'warning',
    index: 'kapakolsun'
  };
 
var search = new FirebaseSearch(proverbsRef, {
  elasticsearch: elasticsearchConfig
}, 'proverbs');

search.elasticsearch.indices.exists()
  .then(function(exists) { // Delete elasticsearch index if it exists
    return exists ? search.elasticsearch.indices.delete() : true;
  })
  .then(function() { // Create elasticsearch index
    return search.elasticsearch.indices.create();
  })
  .then(function() { // Set listeners
    search.elasticsearch.firebase.start();
    search.on('all', function(e) {
      console.log(e.name, e.detail.description, "\n");
    });
    return true;
  })
  .then(function() {
    return proverbsRef.remove();
  })
  .then(function () { // Read users from disk and push one to Firebase every 1000 millis
    return new Promise(function (resolve, reject) {
      var proverbs = require('./fake-users.json');
      var pushProverbs = function (proverb) {
        proverbsRef.push(proverb)
          .then(function () {
            setTimeout(function () {
              if (proverbs.length) {
                pushProverbs(proverbs.pop());
              } else {
                resolve();
              }
            }, 1000);
          });
      };
      pushProverbs(proverbs.pop());
    });
  })
  .then(function () {
    console.log('All records added. Now play around with the Firebase data to watch things change.');
    // process.exit();
  });

