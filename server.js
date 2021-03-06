var express    =  require('express'),
    mongoose   =  require('mongoose'),
    http       =  require('http'),
    socketIo   =  require('socket.io'),
    bodyParser =  require('body-parser'),
    morgan     =  require('morgan'),
    request    =  require('request')
    fs         =  require('fs'),
    _          =  require('underscore');


var app = express();
var wrapperServer=http.Server(app);
var io = socketIo(wrapperServer);

mongoose.connect(process.env.MONGOLAB_URI||'mongodb://localhost/dengaiping')

var CharacterSchema= new mongoose.Schema({
  character: {type: String},
  radicals: {type: Array}
});
var RadicalSchema= new mongoose.Schema({
  radical: {type: String},
  strokes: {type: Number},
  characters: {type: Array}
});

var Character = mongoose.model('Character', CharacterSchema);
var Radical = mongoose.model('Radical', RadicalSchema);
//need to fix this if statement
Character.count({}, function(err, count){
  if(count===0){
    // DB populating by character
    fs.readFile('./client/files/KanRad.txt','utf8',function(err,data){
      if (err) {
       return console.log(err);
     }
      for (var i = 0; i < data.match(/^(.) : (.*)$/gm).length; i++) {
        char=data.match(/^(.) : (.*)$/gm)[i].match(/(.) : /m)[1];
        rads=data.match(/^(.) : (.*)$/gm)[i].match(/\s:\s(.*)/g)[0].split(' ');
        rads.shift(); rads.shift();
        line={
          character: char,
          radicals: rads
        };
        char = new Character(line);
        char.save(function(){
          console.log(char);
        });
      }
    });
  }
});

Radical.count({}, function(err, count){
  var rad;
  var radData={}
  if(count===0){
    fs.readFile('./client/files/RadKan.txt','utf8',function(err,data){
      if (err) {
       return console.log(err);
     }else{
       data =data.split('\n$')
       data.shift()

      for (var i = 0; i < data.length; i++) {
        radicalInfo = data[i].match(/ (.) ([0-9]{1,2})\n(.+)| (.) ([0-9]{1,2}).+\n(.+)/)
        if (radicalInfo[1]) {
          radical = radicalInfo[1]
          strokeNum = radicalInfo[2]
          allCharacters = radicalInfo[3].split('')
        }else{
          radical = radicalInfo[4]
          strokeNum = radicalInfo[5]
          allCharacters = radicalInfo[6].split('')
        }

        radData = {
          radical: radical,
          strokes: strokeNum,
          characters: allCharacters
        }

        rad = new Radical(radData);
        rad.save(function(){
              console.log(radData);
            });
      }
     }

    });
  }
});
// if(false){
//   // Radical.findOne({radical: 'ノ'}).then(function(shtuff){console.log(shtuff.characters)});
//   // Radical.find({}, function(err, results){
//   //   var radicals = []
//   //    for (var i = 0; i < results.length; i++) {
//   //      radicals.push(results[i].radical);
//   //    }
//   //    console.log(radicals.length);
//   //  });
//
//
//
// }else{
//   // var char;
//
//   // console.log(Character.find({}));
//   console.log('successful fail');
//
//   // DB populating by radical
//
//
// }



app.use(express.static(__dirname+'/client'));
io.on('connection',function(socket, response){
  socket.on('get characters', function(radicals){
    if (radicals.length===1){
      Character.where('radicals').in(radicals).exec(function(err,results){
        var characters = []
        for (var i = 0; i < results.length; i++) {
          characters.push(results[i].character);
        }
        console.log(characters);
        io.emit('send characters', characters);
      });
    }else if(radicals.length>1){
      var characters = [];
      var compare = [];
      var newRads=[];
          Character.where('radicals').in([radicals[0]]).exec(function(err,result){
            for (var radIdx = 0; radIdx < radicals.length; radIdx++) {
              if(radIdx===0){
                for (var i = 0; i < result.length; i++) {
                  characters.push(result[i].character);
                }
                console.log("first chars:"+characters);
              }else{
                Character.where('radicals').in([radicals[radIdx]]).exec(function(err,results){

                  (function(){for (var i = 0; i < results.length; i++) {
                    var radicalSearched= radicals[radIdx]
                    console.log(radicals[radIdx]);
                    compare.push(results[i].character);
                  }})()
                  console.log('compare:'+compare);
                  console.log('chars:'+characters);
                  characters=_.intersection(characters,compare);
                  console.log('chars:'+characters);

                }).then(function(){console.log(radIdx);io.emit('send characters', characters)});;
              }
            }


      })
    }
  });
});
io.on('connection',function(socket, response){
  console.log('connected');
  socket.on('search request', function(search){
    console.log('Searching:', search);
    console.log(encodeURIComponent(search));
    request('http://www.unicode.org/cgi-bin/GetUnihanData.pl?codepoint='+encodeURIComponent(search), function (error, response, body) {
      if (!error && response.statusCode == 200) {
        data={
          character: null,
          traditionalForm: null,
          simplifiedForm: null,
          pinYin: null,
          definition: null
        };

        if(body.match(/font size="7">(.)</)){
            data.character= body.match(/font size="7">(.)</)[1];
        }else{
          console.log(body);
        }
        if (body.match(/kDefinition.*\n.*\n.*\n.*>(.*)</)) {
          data.definition= body.match(/kDefinition.*\n.*\n.*\n.*>(.*)</)[1];
        }else{
          data.definition= "Definition not found"
        }

        if (body.match(/kSimplifiedVariant.*\n.*\n.*\n.*(\&.*;)</)){
          data.simplifiedForm= body.match(/kSimplifiedVariant.*\n.*\n.*\n.*(\&.*;)</)[1];

        }else if (body.match(/kTraditionalVariant.*\n.*\n.*\n.*(\&.*;)</)) {
          data.traditionalForm= body.match(/kTraditionalVariant.*\n.*\n.*\n.*(\&.*;)</)[1];

        }
        if (body.match(/kHanyuPinyin.*\n.*\n.*\n.*:(.*)</)) {
          data.pinYin= body.match(/kHanyuPinyin.*\n.*\n.*\n.*:(.*)</)[1].split(', ');

        }else if (body.match(/kMandarin.*\n.*\n.*\n.*<code>(.*)</)) {
          data.pinYin= body.match(/kMandarin.*\n.*\n.*\n.*<code>(.*)</)[1].split(', ');

        }else if (body.match(/kHanyuPinlu.*\n.*\n.*\n.*(.*)\(/)) {
          data.pinYin= body.match(/kHanyuPinlu.*\n.*\n.*\n.*(.*)\(/)[1].split(', ');

        }else if (body.match(/kXHC1983.*\n.*\n.*\n.*:(.*)</)) {
          data.pinYin= body.match(/kXHC1983.*\n.*\n.*\n.*:(.*)</)[1].split(', ');

        }else{
          data.pinYin= 'n/a'
        }
        console.log(data); //why does this log the whole fucking input
        // data=JSON.parse(body)
        // console.log(data);
        io.emit('send data', data)
      }else{
        console.log('fail');
      }
    });


  });
});



app.get('/', function(req,res){

  res.sendFile(__dirname+'/client/index.html');
  console.log("get request");

});
app.get('/faq', function(req,res){
  res.sendFile(__dirname+'/client/faq.html')
})

app.get('/api/CharRads',function(req,res){
  //populates an api of all radicals to populate the home page
  Radical.find({},function(err, results){
    var radicals = []
     for (var i = 0; i < results.length; i++) {
       radicals.push(results[i]);
     }
     radicals= radicals.sort(function(a,b){;return a.strokes-b.strokes})
    res.json(radicals)
  });

});

var port=process.env.PORT || '8080';


// app.listen(port, function(){
wrapperServer.listen(port,function(){
    console.log('started...');
});
