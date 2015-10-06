require('../af/af.js');

$_('grapeTweet-server').main(function(){
    var http= require('http');
    var https= require('https');
    var storage= require('node-persist');
    var oauth= require('./oauth.js');
    var url= require('url');
    var App= this;

    var createUniqueId= function(){
        var time = Date.now();
        while (time == Date.now()){}
        return Date.now();
    };

    var newMessages= function(messages, id){
        App.clients.set(id, {
            lastStreamUpdate : (new Date()).toString()
        });

        messages.forEach(function(message){
            if(message !== ''){
                message= $$.JSON.parse(message);
                if(message.direct_message){
                    message.direct_message.type= 'direct_message';
                    App.clientsMessages[id].push(message.direct_message);
                    App.notifyClient(id);
                    $$.console.log('new direct_message message on stream '+id+'!');
                }else if(message.friends || message.retweet_count || message.retweet_count === 0){
                    return;
                }else{
                    $$.console.log(message);
                }
                App.clients.set(id, {
                    newMessages : true
                });
            }
        });
    };

    storage.initSync({ dir : 'storage' });

    if(!storage.getItem('clients')) storage.setItem('clients', {});

    this.clientsTokenCache= {};
    this.clientsMessages= {};
    this.clients= {
        get : function(id){
            var clients= storage.getItem('clients');
            if(id){
                return clients[id];
            }else{
                return clients;
            }
        },

        set : function(id, update){
            var clients= storage.getItem('clients');
            var current= clients[id] || {};
            Object.keys(update).forEach(function(key){
                current[key]= update[key];
            });
            clients[id]= current;
            storage.setItem('clients', clients);
        },

        delete : function(id){
            var clients= storage.getItem('clients');
            if(clients[id]){
                delete clients[id];
                storage.setItem('clients', clients);
                return true;
            }else{
                return false;
            }
        }
    };

    this.openStreams= {};

    this.registerNewClient= function(clientInfo){
        var id= createUniqueId();

        this.clients.set(id, {
            clientId : id,
            endpoint : clientInfo.endpoint,
            verified : false,
            streamStatus : 0,
            streamError: null,
            lastStreamUpdate : null,
            newMessages : false
        });

        $$.setTimeout(function(){
            if(!App.clients.get(id).verified){
                App.clients.delete(id);
                $$.console.log('client '+ id +' did not response!');
            }
        }, 120000);

        return $$.JSON.stringify({
            status : 1,
            clientId : id
        });
    };

    this.verifyClient= function(clientInfo){
        var id= clientInfo.id;

        $$.console.log('trying to verify client...');

        this.clients.set(id, {
            verified : true
        });

        App.clientsTokenCache[id]= {
            token : clientInfo.x1,
            secred : clientInfo.x2
        };

        App.clientsMessages[id]= [];

//	 	open new stream for this client
        App.createStream(id);
        return $$.JSON.stringify({
            status : 1,
            verified : true
        });
    };

    this.notifyClient= function(id){
        var endpoint= url.parse(this.clients.get(id).endpoint);

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
        if(!App.openStreams[id]){
            var tokens= App.clientsTokenCache[id];
            var oauthHeader= oauth.createHeader('https://userstream.twitter.com/1.1/user.json', 'TLeiAYSBAbIKnSWZ9qIg72PLI', 'HTSLlTLxiC1fbLzkxa4D2YaYRxRA58Eor8zGFMQEpRPYou4g2V', tokens.token, tokens.secred, null);
            var request= App.openStreams[id]= https.request({
                hostname : 'userstream.twitter.com',
                method : 'GET',
                path : '/1.1/user.json',
                headers : {
                    'Authorization' : oauthHeader
                }
            },function(response){
                var buffer= '';
                response.setEncoding('utf8');

                response.on('readable', function(){
                    var data= response.read();
                    if(data.indexOf('\r\n') < 0){
                        buffer+= data;
                    }else{
                        var messages= (buffer+data).split('\r\n');
                        buffer= messages.pop();
                        newMessages(messages, id);
                    }
                });

                response.on('close', function(){
                    App.clients.set(id, {
                        streamStatus : 0
                    });
                    $$.console.log('stream '+ id +' has been closed unexpected!');
                });

                App.clients.set(id, {
                    streamStatus : 1
                });
                $$.console.log('stream '+ id +' successfully opened!');

            });
            request.on('error', function(e){
                App.clients.set({
                    streamStatus : 2,
                    streamError : e.message
                });
                $$.console.log(id +': stream error!');
                $$.console.log(e.message);
            });
            request.end();
        }
    };

    this.grabClientMessages= function(clientInfo){
        var messages= App.clientsMessages[clientInfo.id];
        App.clientsMessages[clientInfo.id]= [];
        App.clients.set(clientInfo.id, {
            newMessages : false
        });
        return $$.JSON.stringify({
            status : 1,
            messages : messages
        });
    };

    this.reverifyClient= function(clientInfo){
        var id= clientInfo.id;

        $$.console.log('trying to reverify client...');

        App.clientsTokenCache[id]= {
            token : clientInfo.x1,
            secred : clientInfo.x2
        };

        App.clientsMessages[id]= [];

//		open new stream for this client
        if(App.openStreams[id]){
            App.openStreams[id].abort();
            App.openStreams[id]= null;
        }
        App.createStream(id);
        return $$.JSON.stringify({
            status : 1,
            verified : true
        });
    };

    this.updateClientEndpoint= function(clientInfo){
        this.clients.set(clientInfo.id, {
            endpoint : clientInfo.endpoint
        });

        if(App.clientsMessages[clientInfo.id].length > 0)
            App.notifyClient(clientInfo.id);

        return $$.JSON.stringify({
            status : 1
        });
    };

    this.server= http.createServer(function(request, response){
        request.setEncoding('utf8');
        response.writeHead(200, { 'Content-Type' : 'application/json' });

        request.on('readable', function(){
            var clientInfo= $$.JSON.parse(request.read());

            if(clientInfo){
                $$.console.log(request.url);
                $$.console.log(clientInfo.id);
                $$.console.log(JSON.stringify(App.clients.get(clientInfo.id)));

//	            register a new client
                if (request.url == '/register') {
                    response.end(App.registerNewClient(clientInfo));
                } else if(App.clients.get(clientInfo.id)) {
//	  		        verify a client
                    if (request.url == '/verify') {
                        response.end(App.verifyClient(clientInfo));

//			        reverify a client / send the token
                    } else if(request.url == '/reverify') {
                        response.end(App.reverifyClient(clientInfo));

//		    	        provide all stored messages
                    } else if(request.url == '/pull') {
                        response.end(App.grabClientMessages(clientInfo));

//			            update the clients endpoint
                    } else if(request.url == '/updateEndpoint') {
                        response.end(App.updateClientEndpoint(clientInfo));
                    } else if(request.url == '/status') {
                        response.end(JSON.stringify({
                            status : 1,
                            client : App.clients.get(clientInfo.id)
                        }));
                    }else{
                        response.end('{ "EMPTY" : "" }');
                    }
                } else {
                    response.end(JSON.stringify({
                        status : 0,
                        errror: 'Eeh? What do you want??'
                    }));
                }
            }
        });

        if(request.method == 'GET')
            response.end('nothing here ^-^');

    }).listen('8080');

    console.log('GrapeTweet push server is ready and listening on ' + this.server.address().address + ':' + this.server.address().port);

    $$.Object.keys(App.clients.get()).forEach(function(id){
        App.clients.set(id, {
            streamStatus : 0
        });
        App.clientsMessages[id]= [{ type : 'server_crash', message : 'The push server crashed or had to be shut down. There will be a messages offset.' }];
        App.notifyClient(id);
    });

    storage.setItem('status', { running : true });
});
