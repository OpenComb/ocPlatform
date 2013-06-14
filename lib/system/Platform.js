
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
var DocViewer = require('ocplatform/lib/mvc/controllers/DocViewer.js') ;
var ViewTemplateCaches = require('ocplatform/lib/mvc/view/ViewTemplateCaches.js') ;
var IdManager = require("ocplatform/lib/usr/IdManager.js") ;
var Step = require('step') ;
var Steps = require("ocsteps") ;

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
	this.server = null ;
	this._connetBaseMiddlewares = {} ;
}

module.exports.prototype.__proto__ = EventEmitter.prototype ;

module.exports.prototype._loadStartupConfig = function(platform)
{
	platform.config = require(platform.rootdir+"/config.json") ;
}

module.exports.prototype._createBaseModules = function(platform){

	// 初始化 template caches
	platform.templates = ViewTemplateCaches.init() ;
	
	platform
		._createConnect(platform)				// 创建 connect
		._createShipper(platform)				// 创建 shipper
		._createRouter(platform)				// 创建路由
}

module.exports.prototype._createConnect = function(platform){
	platform.connect = connect() ;
	return this ;
}
module.exports.prototype._createRouter = function(platform){
	platform.router = new Router(platform) ;
	return this ;
}
module.exports.prototype._createShipper = function(platform)
{
	platform.shipper = new ShipperServer() ;

	var platformfolder = _pt.dirname(require.resolve("ocplatform/package.json")) ;
	platform.shipper.registerAllowFolder( platformfolder+"/public/" ) ;
	platform.shipper.registerAllowFolder( platformfolder+"/lib/mvc/Nut.js" ) ;
	platform.shipper.registerAllowFolder( platformfolder+"/lib/mvc/view" ) ;
	platform.shipper.registerAllowFolder( platformfolder+"/lib/mvc/MessageQueue.js" ) ;
	platform.shipper.registerAllowFolder( platformfolder+"/lib/mvc/Validator.js" ) ;
	platform.shipper.registerAllowFolder( platformfolder+"/lib/util/" ) ;
	platform.shipper.registerAllowFolder( _pt.dirname(require.resolve("occlass/package.json"))+"/lib/" ) ;
	platform.shipper.registerAllowFolder( _pt.dirname(require.resolve("octemplate/package.json"))+"/lib/" ) ;
	platform.shipper.registerAllowFolder( _pt.dirname(require.resolve("stack-trace/package.json"))+"/lib/" ) ;
	platform.shipper.registerAllowFolder( _pt.dirname(require.resolve("step/package.json"))+"/lib/" ) ;
	return this ;
}



module.exports.prototype._loadExtensions = function(platform){
	pubs = [] ;
	var rootdir = process.cwd() ;
	var modulesdir = rootdir + "/node_modules/" ;

	console.log("_loadExtensions()") ;
	
	this.step(

		// 注册 opencomb/public 目录
		function(){
			fs.exists(rootdir+"/public",this.hold()) ;
		}
		, function(exists)
		{
			if( exists )
			{
				pubs.push({
					root: rootdir+"/public"
					, urlroot: "/public"
				}) ;
			}
		}

		// 各个扩展目录
		, function(){
			// 读取 node_modules 目录
			fs.readdir(modulesdir,this.hold()) ;
		}
		, function(err,files){
			err && this.terminate() ;

			if(!files || !files.length)
			{
				return ;
			}

			for(var i=0;i<files.length;i++)
			{
				var moddir = modulesdir + files[i] ;
				var extscript = moddir + "/extension.js" ;

				this.step(

					// 注册 public 目录 -------
					[moddir], function(moddir){
						fs.exists(moddir+"/public",this.hold('exists')) ;
					}
					, [moddir,files[i]], function(moddir,foldername){
						if(this.recv.exists)
						{
							pubs.push({
								root: moddir+"/public"
								, urlroot: "/"+foldername+'/public'
							}) ;
						}
					}

					// 执行 onload 函数 -------
					, [extscript], function(extscript){
						fs.exists(extscript,this.hold('exists')) ;
					}
					, [extscript,files[i]], function(extscript,extname){
						if(!this.recv.exists)
						{
							return ;
						}
						
						console.log("loading extension script: "+extscript) ;
						var extension = require(extscript) ;

						this.try() ;
						
						// 执行 onload 事件
						if( typeof extension=='function' )
						{
							this.step([platform],extension) ;
						}
						else if( typeof extension.onload=='function' )
						{
							this.step([platform],extension.onload) ;
						}
						else
						{
							throw new Error("导出的内容代码无效："+extscript) ;
						}
						
						this.catch(function(err){
							var error = new Error("蜂巢在执行扩展"+extname+"的 extension.js 文件的时候遇到了错误") ;
							error.cause = err ;
							throw error ;
						}) ;
					}
				) ;
			}
		}
	) ;

}



module.exports.prototype._createBaseMiddlewares = function(platform){

	console.log("_createBaseMiddlewares") ;
	
	for(var i=0;i<pubs.length;i++)
	{
		console.log("public folder: "+pubs[i].urlroot+" >> "+pubs[i].root) ;
		platform.connect.use(public(pubs[i].root,pubs[i].urlroot)) ;
	}

	platform._connetBaseMiddlewares = {
		"shipper": platform.shipper.middleware.bind(platform.shipper)
		, "favicon": connect.favicon()
		, "cookie": connect.cookieParser()
		, "session": connect.session({ secret: 'opencomb platform', cookie: { maxAge: 1800000 }, store: platform.sessionStore })
		, "IdManager": IdManager.middleware
		, "body": connect.bodyParser()
		, "doc": DocViewer.middleware
		, "router": platform.router.route.bind(platform.router)
		, "notfound": function(req,rspn){
			rspn.statusCode = "404" ;
			rspn.write("<h1>404</h1>") ;
			rspn.end() ;
		}
	}
	for(var name in platform._connetBaseMiddlewares)
	{
		platform.emit('beforeLoadConnectBaseMiddleware',name,platform.connect,platform) ;
	
		platform.connect.use( platform._connetBaseMiddlewares[name] ) ;
	
		platform.emit('afterLoadConnectBaseMiddleware',name,platform.connect,platform) ;
	}
}

module.exports.prototype._connectDatabase = function(platform){

	if(!this.config.db || !this.config.db.server)
	{
		console.log("missing database configs") ;
		throw new Error("缺少数据库配置") ;
	}
	else
	{
		var server = new mongodb.Server(this.config.db.server, this.config.db.port||27017) ;
		
		(new mongodb.Db("opencomb",server,{w:1})).open(this.hold()) ;
		
		this.step(function(err,client){
		
			if( err )
			{
				throw new Error("无法链接到数据库："+err) ;
			}

			if(client)
			{
				platform.emit("openDB",err,client) ;
				platform.db = new DB(client) ;
			}
		}) ;
	}
}

module.exports.prototype._createHttpPortServer = function(platform){
	var port = this.config.server? (this.config.server.port || 6060): 6060 ;
	this.server = http.createServer(this.connect).listen(port,this.hold());
	this.step(function(err){
		platform.emit("createServer",err,this) ;
	}) ;
}

module.exports.prototype.startup = function(callback){
	Steps(
	
		// 载入启动配置
		[this], this._loadStartupConfig
		
		// 创建基础功能对象
		, [this], this._createBaseModules
		
		// 加载扩展
		, [this], this._loadExtensions
		
		// 创建基础中间件
		, [this], this._createBaseMiddlewares

		// 连接数据库
		, [this], this._connectDatabase

		// 创建 http 端口服务器
		, [this], this._createHttpPortServer

		// 为前端框架生成代码
		, function(){
			this.shipper.buildFrontendFramework(this.config.dev.frontend.bundle,this.hold()) ;
			this.step(function(err){
				if(err)
				{
					var error = new Error("初始化前端框架时遇到了错误") ;
					error.cause = err ;
					throw error ;
				}
			}) ;
		}
		
	).on("done",function(err){
		callback && callback(err,this) ;
	}).bind(this) () ;
}

