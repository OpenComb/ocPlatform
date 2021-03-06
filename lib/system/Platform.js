
var Class = require("occlass/lib/Class.js") ;
var _pt = require("path") ;
var fs = require("fs") ;
var http = require('http');
var url = require('url');
var connect = require('connect') ;
var mongodb = require('mongodb');
var Router = require("./Router.js") ;
var ShipperServer = require("ocplatform/lib/system/ShipperServer.js") ;
var public = require("./middleware/public.js") ;
var SessionStore = require("./SessionStore.js") ;
var DB = require("ocplatform/lib/DB.js") ;
var EventEmitter = require('events').EventEmitter ;
var MdViewer = require('ocplatform/lib/mvc/controllers/MarkdownViewer.js') ;
var ViewTemplateCaches = require('ocplatform/lib/mvc/view/ViewTemplateCaches.js') ;
var Step = require('step') ;
var IdManager = require("ocplatform/lib/usr/IdManager.js") ;


if(typeof window!='undefined')
{
	throw new Error(__filename+'can not run under browser.') ;
}



module.exports = function(){

	if(!module.exports.singleton)
	{
		module.exports.singleton = this ;
		global.$opencomb = this ;
	}

	// parent 构造函数
	EventEmitter.apply(this,arguments) ;

	var platform = this ;
	this.rootdir = process.cwd() ;

	this.connect = null ;
	this.shipper = null ;
	this.router = null ;
	this.templates = null ;
	this.db = null ;
	this.config = {} ;
	this.sessionStore = new SessionStore(this) ;
	this._connetBaseMiddlewares = {} ;
}

module.exports.prototype.__proto__ = EventEmitter.prototype ;

module.exports.prototype._loadStartupConfig = function(callback)
{
	this.config = require(this.rootdir+"/config.json") ;

	// 关闭所有 dev 选项
	if( !this.config.enableDev && typeof this.config.dev=='object')
	{
		(function disableOption(configs)
		{
			for(var name in configs)
			{
				var type = typeof configs[name] ;
				if( type=='object' )
				{
					disableOption(configs[name]) ;
				}
				else if(type!='function')
				{
					configs[name] = false ;
				}
			}
		}) (this.config.dev) ;
	}

	callback && callback(null) ;
}

module.exports.prototype._createBaseModules = function(callback){

	// 初始化 template caches
	this.templates = ViewTemplateCaches.init() ;

	this
		._createConnect()				// 创建 connect
		._createShipper()				// 创建 shipper
		._createRouter()				// 创建路由

	callback && callback(null) ;
}

module.exports.prototype._createBaseMiddlewares = function(callback){

	for(var i=0;i<pubs.length;i++)
	{
		this.connect.use(public(pubs[i].root,pubs[i].urlroot)) ;
	}

	this._connetBaseMiddlewares = {
		"shipper": this.shipper.middleware.bind(this.shipper)
		, "favicon": connect.favicon()
		, "cookie": connect.cookieParser()
		, "session": connect.session({ secret: 'opencomb platform', cookie: { maxAge: 1800000 }, store: this.sessionStore })
		, "IdManager": IdManager.middleware
		, "body": connect.bodyParser()
		, "doc": MdViewer.middleware
		, "router": this.router.route.bind(this.router)
		, "notfound": function(req,rspn){
			rspn.write("<h1>404</h1>") ;
			rspn.end() ;
		}
	}
	for(var name in this._connetBaseMiddlewares)
	{
		this._loadConnectBaseMiddleware(name) ;
	}

	callback && callback(null) ;
}

module.exports.prototype._loadConnectBaseMiddleware = function(name){

	this.emit('beforeLoadConnectBaseMiddleware',name,this.connect,this) ;

	this.connect.use( this._connetBaseMiddlewares[name] ) ;

	this.emit('afterLoadConnectBaseMiddleware',name,this.connect,this) ;
}

module.exports.prototype._createRouter = function(){
	this.router = new Router(this) ;
}
module.exports.prototype._createShipper = function()
{
	this.shipper = new ShipperServer() ;

	var platformfolder = _pt.dirname(require.resolve("ocplatform/package.json")) ;
	this.shipper.registerAllowFolder( platformfolder+"/public/" ) ;
	this.shipper.registerAllowFolder( platformfolder+"/lib/mvc/Nut.js" ) ;
	this.shipper.registerAllowFolder( platformfolder+"/lib/mvc/view" ) ;
	this.shipper.registerAllowFolder( platformfolder+"/lib/mvc/MessageQueue.js" ) ;
	this.shipper.registerAllowFolder( platformfolder+"/lib/util/" ) ;
	this.shipper.registerAllowFolder( _pt.dirname(require.resolve("occlass/package.json"))+"/lib/" ) ;
	this.shipper.registerAllowFolder( _pt.dirname(require.resolve("octemplate/package.json"))+"/lib/" ) ;
	this.shipper.registerAllowFolder( _pt.dirname(require.resolve("stack-trace/package.json"))+"/lib/" ) ;
	this.shipper.registerAllowFolder( _pt.dirname(require.resolve("step/package.json"))+"/lib/" ) ;
	return this ;
}

module.exports.prototype._createConnect = function(pubs){
	this.connect = connect() ;
	return this ;
}

module.exports.prototype._loadExtensions = function(callback){
	pubs = [] ;
	var modulesdir = process.cwd() + "/node_modules/" ;
	var platform = this ;
	fs.readdir(modulesdir,function(err,files){

		if(err)
		{
			callback && callback(err,pubs) ;
			return ;
		}

		(function loadExtension(err){

			if(err)
			{
				// 打印错误，继续执行
				console.log(err.toString()) ;
			}

			if(!files.length)
			{
				callback && callback(null) ;
				return ;
			}

			var foldername = files.shift() ;
			var moddir = modulesdir + foldername ;

			// 注册 public 目录
			if( fs.existsSync(moddir+"/public") )
			{
				pubs.push({
					root: moddir+"/public"
					, urlroot: "/"+foldername+'/public'
				}) ;
			}

			// 执行 onload 函数
			var extensionpath = null ;
			try{
				extensionpath = require.resolve( moddir + "/extension.js" ) ;
			}catch(e){
				if(!e.message.match(/^Cannot find module /))
				{
					// 打印错误，继续执行
					console.log(e) ;
				}
			}

			var waitingOnLoadCallback = false ;
			if(extensionpath)
			{
				console.log("load extension initialize script: "+extensionpath+"...");

				var extension = require(extensionpath) ;

				// 执行 onload 事件
				if( typeof extension=='function' )
				{
					waitingOnLoadCallback = !extension(platform,loadExtension) ;
				}
				else if( typeof extension.onload=='function' )
				{
					waitingOnLoadCallback = !extension.onload(platform,loadExtension) ;
				}
				else
				{
					console.log(new Error("导出的内容代码无效："+moddir + "/extension.js")) ;
				}
			}

			if(!waitingOnLoadCallback)
			{
				loadExtension(null) ;
			}

		}) () ;
	})
}

module.exports.prototype._connectDatabase = function(callback){

	var platform = this ;

	if(!this.config.db || !this.config.db.server)
	{
		console.log("missing database configs") ;
		return ;
	}
	else
	{
		var server = new mongodb.Server(this.config.db.server, this.config.db.port||27017) ;
		(new mongodb.Db("opencomb",server,{w:1}))
			.open(function(err,client){

				if(client)
				{
					platform.emit("openDB",err,client) ;

					platform.db = new DB(client) ;
				}
				callback(err,this) ;
			}) ;
	}
}

module.exports.prototype._createHttpPortServer = function(callback){
	var platform = this ;
	var port = this.config.server? (this.config.server.port || 6060): 6060 ;

	http.createServer(this.connect).listen(port,function(err){
		callback(err,platform) ;
	});
}

module.exports.prototype.startup = function(callback){

	var platform = this ;
	Step(

		// 载入启动配置
		function (){
			platform._loadStartupConfig(this) ;
		}

		// 创建基础功能对象
		, function (err){
			if(err)
			{
				callback && callback(err,platform) ;
				return ;
			}
			platform._createBaseModules(this) ;
		}

		// 加载扩展
		, function (err){
			if(err)
			{
				callback && callback(err,platform) ;
				return ;
			}
			platform._loadExtensions(this) ;
		}

		// 创建基础中间件
		, function (err){
			if(err)
			{
				callback && callback(err,platform) ;
				return ;
			}
			platform._createBaseMiddlewares(this) ;
		}

		// 连接数据库
		, function (err){
			if(err)
			{
				callback && callback(err,platform) ;
				return ;
			}
			platform._connectDatabase(this) ;
		}

		// 创建 http 端口服务器
		, function (err){
			if(err)
			{
				var error = new Error("连接数据库的时候遇到了错误") ;
				error.cause = err ;

				callback && callback(error,platform) ;
				return ;
			}
			platform._createHttpPortServer(this) ;
		}

		// 为前端框架生成代码
		, function(err){
			if(err)
			{
				var error = new Error("启动 http server 时遇到了错误") ;
				error.cause = err ;

				callback && callback(error,platform) ;
				return ;
			}
			platform.shipper.buildFrontendFramework(this) ;
		}

		// 完成
		, function done(err)
		{
			callback && callback(err,platform) ;
		}
	) ;
//
//	var onestep, steps = [
//
//		// 载入启动配置
//		this._loadStartupConfig.bind(this)
//
//		// 创建基础功能对象
//		, this._createBaseModules.bind(this)
//
//		// 加载扩展
//		, this._loadExtensions.bind(this)
//
//		// 创建基础中间件
//		, this._createBaseMiddlewares.bind(this)
//
//		// 连接数据库
//		, this._connectDatabase.bind(this)
//
//		// 创建 http 端口服务器
//		, this._createHttpPortServer.bind(this)
//
//		// 为前端框架生成代码
//		, (function(err,callback){
//			if(err)
//			{
//				throw err ;
//			}
//			this.shipper.buildFrontendFramework(callback) ;
//		}).bind(this)
//
//	] ;
//	(function step(err)
//	{
//		if(err)
//		{
//			throw err ;
//		}
//		if( !(onestep=steps.shift()) )
//		{
//			// 完成
//			callback(null,this) ;
//		}
//		else
//		{
//			onestep( err, arguments.callee )
//		}
//	}) () ;
}

