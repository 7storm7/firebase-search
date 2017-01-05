  var FirebaseSearch = require('./firebase-elasticsearch-driver.js');
  var firebase = require('firebase');
  var axios = require('axios');
  var _ = require('lodash');

  console.log("!!!!!!!arg: ", process.argv[2]);
  console.log("!!!!!!!willDelete: ", process.argv[2] === "d");


  var willDelete = (process.argv[2] === "d") ?  true: false;

  var newItems = false;



  firebase.initializeApp({
    "databaseURL": "https://quiver-firebase-search-ad877.firebaseio.com",
    "serviceAccount": "./service-account.json"
  });

  var proverbsRef = firebase.database().ref('kapakolsun/proverbs');
  var requestsRef = firebase.database().ref('kapakolsun/search-requests');
  var zeroMatchesRef = firebase.database().ref('kapakolsun/zero-match-keywords');


  var elasticsearchConfig = {
    host: '10.128.0.2:9200',
    log: 'warning',
    index: 'kapakolsun',
    scroll:'30s'
  };

  var search = new FirebaseSearch(proverbsRef, {
    elasticsearch: elasticsearchConfig
  }, 'proverbs');


  function updateElastic( keyword, uid)
  {
    //var newPost = snapshot.val();
    //console.log("Created At: " + newPost.createdAt);
    console.log("Keyword: " + keyword);
    //console.log("snapshot: " + snapshot.key);
    console.log("uid: " + uid);


    //console.log("Results: " + newPost.searchResults);

    //console.log("Previous Post ID: " + prevChildKey);
    //trial: match all body
    let body = {
      size: 20,
      from: 0,
      query: {
        match_all: {}
      }
    };
    //trial: match with keyword  body
    let body2 = {
      query: {
        match: {
          description: {
            query: 'insanlar'
          }
        }
      }
    }

    //trial: match in multiple field body
    let body3 = {
      query:{
        multi_match: {
          query: keyword,
          //  type: 'phrase',
          fields: ['titles', 'description']
        }
      }
    }

    //trial: match instant (search-as-you-type) field  body
    let body4 = {
      query:{
        match_phrase_prefix: {
          description: {
            query: keyword,
          }
        }
      }
    }

    //trial: match merge with two field  body
    let body5 = {
      "query": {
        "bool": {
          "should": [      
          {
            match: {
              "titles": {
                query: "cefa"
              }
            }
          },
          {
            match: {
              "description": {
                query: "cefa"
              }
            }
          },
          ]
        }
      }
    }
    //trial: instant match merge with two field  body
    let body6 = {
      query: {
        bool: {
          should: [
          {
            match_phrase_prefix: {
              "description": {
                query: keyword
              }
            }
          },{
            match_phrase_prefix: {
              "titles": {
                query: keyword
              }
            }
          }]
        }
      }
    }

    //trial: instant match merge with two field  body
    let body7 = {
      from : 0, size : 13,
      query: {
        bool: {
          should: [
          {
            match_phrase_prefix: {
              "description": {
                query: keyword,
                _name: "description"
              }
            }
          },{
            match_phrase_prefix: {
              "titles": {
                query: keyword,
                _name: "titles"
              }
            }
          }]
        }
      }
    }


    const mysearch = function xsearch(index, body) {
      return search.elasticsearch.search({index: index, body: body7, scroll:elasticsearchConfig.scroll});
    };

    var itemNum = 0;
    mysearch("kapakolsun", body7)
    .then(function (res) {

      if (res.hits.total == 0) {
        recordZeroMatch(uid, keyword);
        return; 
      }

      var insertToFirebase = function(response) {
             //console.log('Search response', res.hits.hits);
        console.log('Search word', keyword);

        var req = requestsRef.child(uid + "/results"); 
          // console.log("<<<req>>> :", req);
        var i = {};
        var matched = {};
        var newResponse;


        var currItems = 0;

        console.log('response.hits.hits.forEach:', response);

        response.hits.hits.forEach(function(item){
          currItems++;
          item.matched_queries.forEach(function(item2){
            // console.log('matched_queries - item2');
            matched[item2] = true;    
          });
          i[item._id] = {"matched": matched,"createdAt": item._source.createdAt, "description":item._source.description, "published": item._source.published, "titles": item._source.titles, "updatedAt": item._source.updatedAt}; 
           newResponse= req.update(i);
        });

        //console.log("res.hits.hits: ", res.hits.hits );
        console.log("response.hits.total: ", response.hits.total );

        console.log("uid: ", uid);
        console.log("keyword: ", keyword);  
        return currItems;
      }



      var goScroll = function(iNum, response) {
        console.log("goScroll: 1" );
          return search.elasticsearch.scroll({scrollId: response._scroll_id,  scroll:elasticsearchConfig.scroll}).then(function (response2) {
            
            console.log('goScroll: scroll result:', response2);
            
            var curr = insertToFirebase(response2);
            console.log('goScroll: curr:', curr);

            iNum = iNum + curr;
             console.log('goScroll: iNum:', iNum);

            if (iNum < response.hits.total)
              goScroll(iNum, response2);

          });
        
        return;
      }

      console.log("insertToFirebase: 1" );

      var num = insertToFirebase(res);

      console.log("insertToFirebase: num: ", num );
      console.log("insertToFirebase: res.hits.total: ", res.hits.total );

      if (num < res.hits.total){

        goScroll(num,res);
      }

    });
      
  }

  function recordZeroMatch(uid, keyword)
  {
    var item = {};
    item[uid]= true;
    firebase.database().ref('kapakolsun/zero-match-keywords/' + keyword).update(item);
  }



  search.elasticsearch.indices.exists()
  .then(function(exists) { // Delete elasticsearch index if it exists
    return exists && willDelete ? search.elasticsearch.indices.delete() : true;
  })
  .then(function() { // Create elasticsearch index
    return willDelete ? search.elasticsearch.indices.create(): true;
  })
  .then(function() { // Set listeners
    search.elasticsearch.firebase.start();
    /*
    search.on('all', function(e) {
      //      console.log(e.name, e.detail.description, "\n");
    });
    */
    return true;
  })
  .then(function() {
    return willDelete ? proverbsRef.remove(): true;
  })
  .then(function () { // Read users from disk and push one to Firebase every 1000 millis
    return !willDelete ? true : new Promise(function (resolve, reject) {
      var proverbs = require('./fake-users.json');
      var pushProverbs = function (proverb) {
      //console.log('     --proverb: ', proverbs);

        proverbsRef.push(proverb)
        .then(function () {
          setTimeout(function () {
            //console.log('proverbs len: ', proverbs.length);
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

    requestsRef.once("value", function(snap) {
      console.log("initial data loaded! ", snap.numChildren());
      newItems = true;
    });

    // Retrieve new posts as they are added to our database
    requestsRef.on("child_added", function(snapshot, prevChildKey) {
      if (newItems){
        var newPost = snapshot.val();
        console.log("The key " + snapshot.key);
        console.log("The added post is " + JSON.stringify(newPost));

        //updateElastic(newPost.keyword, snapshot.ref());
        updateElastic(newPost.keyword.value, snapshot.key);

        console.log("keywordRef:::", 'kapakolsun/search-requests/'+snapshot.key+'/keyword');
      }

      var keywordRef = firebase.database().ref('kapakolsun/search-requests/'+snapshot.key+'/keyword');
      keywordRef.on("child_changed", function(snapshot2) {
       var changedPost = snapshot2.val();
       console.log("The updated post is " + changedPost);
       console.log("The updated key " + snapshot2.key);

       updateElastic(changedPost, snapshot.key);
     });

    });

  });



