var _url = require("url") ;
var querystring = require("querystring") ;
var Nut = require("./Nut.js") ;

module.exports = function(controller,req,rsp,platform)
{
	this.req = req ;
	this.rsp = rsp ;
	this.platform = platform ;
	this.db = platform.db ;

	// 创建并初始化 nut
	this.nut = new Nut(controller) ;

	// 创建 seed
	this.seed = {} ;


	this._children = {} ;
}

/**
 * 用http request 里的 Get/Post 数据填充 seed
 */
module.exports.prototype.fillSeedByReq = function()
{
	// get params
	var url = _url.parse(this.req.url) ;
	var getparams = querystring.parse(url.query||"") ;

	// post params
	if(this.req.body)
	{
		getparams.__proto__ = this.req.body ;
	}

	this.seed.__proto__ = getparams ;

	return this ;
}

module.exports.prototype.createChild = function(name,childController)
{
	var child = new module.exports(childController,this.req,this.rsp,this.platform) ;
	this._children[name] = child ;

	// 连接 nut
	this.nut._children[name] = child.nut ;

	// 从自己的seed 分离出 child 的seed
	child.seed = this.seed['@'+name] || {} ;

	return child ;
}

module.exports.prototype.collection = function(name,extname)
{
	if(!this.platform.db)
	{
		throw new Error("not connected to the db yet.") ;
	}
	return this.db.collection(name,extname) ;
}

module.exports.prototype.hold = function()
{
	this.rsp.pause() ;
}
module.exports.prototype.release = function()
{
	this.rsp.resume() ;
}

module.exports.prototype.destroy = function()
{
	this.req = null ;
	this.rsp = null ;
	this.platform = null ;

	for(var name in this._children)
	{
		this._children[name].destroy() ;
		this._children[name] = null ;

		this.seed['$'+name] = null ;
	}
	this._children = null ;



	this.nut.destroy() ;
	this.nut = null ;
	this.seed = null ;
}