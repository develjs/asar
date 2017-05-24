(function() {
	
	const Transform = require('stream').Transform;
	const util = require('util');
	const KEY = process.env.ASAR_ENCODE_KEY
	
	function encodeBuffer(buffer){
		if (KEY)
			for (var i=0; i<buffer.length; i++)
				buffer[i] = buffer[i]^KEY;
		return buffer;
	}
	
	function Encode(options) {
		if (!(this instanceof Encode))
			return new Encode(options);
			
		Transform.call(this, options);
	}
	util.inherits(Encode, Transform);

	Encode.prototype._transform = function (data, encoding, callback) {
		data = encodeBuffer(data); // here you can transform the data
		this.push(data); // write data imediatly
		callback();
	};

	// static methods
	Encode.encodeBuffer = encodeBuffer;

	module.exports = Encode;
	
}).call(this);
