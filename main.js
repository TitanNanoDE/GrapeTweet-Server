require('./af/af.js');

$('application').new('grapeTweet-server');

$_('grapeTweet-server').main(function(){
	var http= require('http');
	var https= require('https');
	var storage= require('node-persist');
	var oauth= require('./oauth.js');
	var url= require('url');
	var app= this;

	var createUniqueId= function(){
		var time = Date.now();
		while (time == Date.now());
		return Date.now();
	};

	var newMessage= function(message, buffer, id){
		if(message.indexOf('\r\n') < 0){
			buffer.content+= message;
		}else{
			var messages= (buffer.content+message).split('\r\n');
			buffer.content= messages.pop();

			messages.forEach(function(message){
				if(message !== ''){
					message= $$.JSON.parse(message);
					if(message.direct_message){
						message.direct_message.type= 'direct_message';
						app.clientsMessages[id].push(message.direct_message);
						app.notifyClient(id);
						$$.console.log('new direct_message message on stream '+id+'!');
					}else if(message.friends || message.retweet_count || message.retweet_count === 0){
						return;
					}else{
						$$.console.log(message);
					}
				}else{
					$$.console.log('stream '+id+' is still alive!');
				}
			});
		}
	};

	storage.initSync({ dir : 'storage' });

	if(!storage.getItem('clients'))
		storage.setItem('clients', {});

	this.clientsTokenCache= {};
	this.clientsMessages= {};
	this.openStreams= {};

	this.registerNewClient= function(clients, clientInfo){
		var clientId= createUniqueId();

		clients[clientId]= {
			clientId : clientId,
			endpoint : clientInfo.endpoint,
			verified : false
		};
		storage.setItem('clients', clients);

		$$.setTimeout(function(){
			if(!storage.getItem('clients')[clientId].verified){
				var clients= storage.getItem('clients');
				delete clients[clientId];
				$$.console.log('client '+ clientId +' does not response!');
				storage.setItem('clients', clients);
			}
		}, 30000);

		return $$.JSON.stringify({
			clientId : clientId
		});
	};

	this.verifyClient= function(clients, clientInfo){
		var id= clientInfo.id;

		$$.console.log('trying to verify client...');

		if(clients[id])
			clients[id].verified= true;
		storage.setItem('clients', clients);

		app.clientsTokenCache[id]= {
			token : clientInfo.x1,
			secred : clientInfo.x2
		};

		app.clientsMessages[id]= [];

//		open new stream for this client
		app.createStream(id);
		return $$.JSON.stringify({
			verified : true
		});
	};

	this.notifyClient= function(id){
		var clients= storage.getItem('clients');
		var client= clients[id];
		var endpoint= url.parse(client.endpoint);

		storage.setItem('clients', clients);

		var request= https.request({
			hostname : endpoint.host,
			method : 'PUT',
			path : endpoint.path
		});
		request.on('error', function(e){
			$$.console.log(e);
		});
		request.write('version='+createUniqueId());
		request.end();
	};

	this.createStream= function(id){
		var tokens= app.clientsTokenCache[id];
		var oauthHeader= oauth.createHeader('https://userstream.twitter.com/1.1/user.json', 'TLeiAYSBAbIKnSWZ9qIg72PLI', 'HTSLlTLxiC1fbLzkxa4D2YaYRxRA58Eor8zGFMQEpRPYou4g2V', tokens.token, tokens.secred, null);
		var request= app.openStreams[id]= https.request({
			hostname : 'userstream.twitter.com',
			method : 'GET',
			path : '/1.1/user.json',
			headers : {
				'Authorization' : oauthHeader
			}
		},function(response){
			var buffer= { content : "" };
			response.setEncoding('utf8');

			response.on('readable', function(){ newMessage(response.read(), buffer, id); });

			response.on('close', function(){
				$$.console.log('stream '+ id +' has been closed unexpected!');
			});

			$$.console.log('stream '+ id +' successfully opened!');

		});
		request.on('error', function(e){
			$$.console.log(id +': stream error!');
			$$.console.log(e.message);
		});
		request.end();
	};

	this.grabClientMessages= function(clientInfo){
		var messages= app.clientsMessages[clientInfo.id];
		app.clientsMessages[clientInfo.id]= [];
		return $$.JSON.stringify(messages);
	};

	this.reverifyClient= function(clients, clientInfo){
		var id= clientInfo.id;

		$$.console.log('trying to reverify client...');

		app.clientsTokenCache[id]= {
			token : clientInfo.x1,
			secred : clientInfo.x2
		};

		app.clientsMessages[id]= [];

//		open new stream for this client
		app.createStream(id);
		return $$.JSON.stringify({
			verified : true
		});
	};

	this.updateClientEndpoint= function(clients, clientInfo){
		clients[clientInfo.id].endpoint= clientInfo.endpoint;
		storage.setItem('clients', clients);
		if(app.clientsMessages[clientInfo.id].length > 0)
			app.notifyClient(clientInfo.id);
		return $$.JSON.stringify({
			status : 'success'
		});
	};

	this.server= http.createServer(function(request, response){
		request.setEncoding('utf8');
		response.writeHead(200, { 'Content-Type' : 'application/json' });

		request.on('readable', function(){
			var clientInfo= $$.JSON.parse(request.read());
			var clients= storage.getItem('clients');

//			register a new client
			if(request.url == '/register'){
				response.end(app.registerNewClient(clients, clientInfo));

//			verify a client
			}else if(request.url == '/verify'){
				response.end(app.verifyClient(clients, clientInfo));

//			reverify a client / send the token
			}else if(request.url == '/reverify'){
				response.end(app.reverifyClient(clients, clientInfo));

//			provide all stored messages
			}else if(request.url == '/pull'){
				response.end(app.grabClientMessages(clientInfo));

//			update the clients endpoint
			}else if(request.url == '/updateEndpoint'){
				response.end(app.updateClientEndpoint(clients, clientInfo));
			}else{
				response.end('{ "EMPTY" : "" }');
			}
		});

		if(request.method == 'GET')
			response.end('{ "EMPTY" : "" }');

	}).listen('8080', process.env.OPENSHIFT_NODEJS_IP);

	$$.Object.keys(storage.getItem('clients')).forEach(function(item){
		app.clientsMessages[item]= [{ type : 'server_crash', message : 'The push server crashed or had to be shut down. There will be a messages offset.' }];
		app.notifyClient(item);
	});

	storage.setItem('status', { running : true });
});
