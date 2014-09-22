require('./google/hmac-sha1.js');

this.createOAuthSignature= function(header, data, method, url, secred, tokenSecred){
	var hash= {};
    var raw= '';
    var base= '';

	$$.Object.keys(header).forEach(function(item){
		hash[$$.encodeURIComponent(item)]= $$.encodeURIComponent(header[item]);
	});
               
	if(data){
		$$.Object.keys(data).forEach(function(item){
			hash[$$.encodeURIComponent(item)]= $$.encodeURIComponent(data[item]); 
		});
	}
               
	$$.Object.keys(hash).sort().forEach(function(item){
		if(raw.length > 0) raw+= '&';
		raw+= item+'='+hash[item];
	});
               
	base+= method + '&' + $$.encodeURIComponent(url) + '&' + $$.encodeURIComponent(raw);
	var key= secred + '&' + tokenSecred;
           
//	console.log(raw);
//	console.log(base);
//	console.log(key);
               
	hash= $$.CryptoJS.HmacSHA1(base, key);
               
	return new $$.Buffer(hash.toString($$.CryptoJS.enc.hex), 'hex').toString('base64');
};
           
this.createOAuthHeader= function(object){
	var header= '';
	$$.Object.keys(object).sort().forEach(function(item){
		if(header.length > 0) header+= ',';
		header+= item+'="'+ $$.encodeURIComponent(object[item]) +'"';
	});
	return 'OAuth ' + header;
};
         
this.createOAuthNonce= function(){
	var nonce= '';
	for(var i= 0; i <= 32; i++){
		nonce+= $$.String.fromCharCode(Math.round(Math.random() * 25) + 97);
	}
	return new $$.Buffer(nonce).toString('base64');
};

this.createHeader= function(url, key, secred, token, tokenSecred, data){
	var oauthHeader= {
		'oauth_consumer_key' : key,
		'oauth_token' : token,
		'oauth_nonce' : this.createOAuthNonce(),
		'oauth_signature_method' : 'HMAC-SHA1',
		'oauth_timestamp' : $$.Date.now().toString().substr(0, 10),
		'oauth_version' : '1.0'
	};
	
	oauthHeader.oauth_signature= this.createOAuthSignature(oauthHeader, data, 'GET', url, secred, tokenSecred);
	
	return this.createOAuthHeader(oauthHeader);
};