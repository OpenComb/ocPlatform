
var utilarr = require("ocplatform/lib/util/array.js") ;
var Controller = require("./Controller.js") ;
var TemplateCaches = require("octemplate/lib/TemplateCaches.js") ;
var fs = require("fs") ;
var path = require("path") ;

exports.loadDefine = function(define,pathname)
{
	// 路径
	if( typeof define=="string")
	{
		// 处理 action/child 格式
		var names = define.split(":") ;
		if(names.length>1)
		{
			var define = this.loadDefine(names[0]) ;

			for(var i=1;i<names.length;i++)
			{
				var define = define.action(names[i],true) ;
				if(!define)
				{
					callback(new Error("cound not found controller by path: "+names.slice(0,i+1).join(":"))) ;
					return ;
				}
			}
		}

		// --- ---
		else
		{
			// 会抛异常
			var fullpath = this.resolve(define) || define ;

			// 加载定义文件
			define = require(fullpath) ;

			// 检查 __as_controller
			if( !define.__as_controller )
			{
				throw new Error(fullpath+"文件没有声明 module.exports.__as_controller=true ，不能被视作控制器。") ;
			}

			if(!pathname)
			{
				pathname = path.relative(process.cwd()+"/node_modules",fullpath) ;
			}
		}
	}

	if(define.__built)
	{
		return define ;
	}

	define.__built = true ;

	define.__proto__ = Controller.Prototype ;
	define.pathname = pathname || undefined ;

	// 定义本身是一个函数
	if( typeof define=='function' )
	{
		define.process = define ;
	}

	function loadMemberController(define,name)
	{
		var mbrPathname = typeof define=='string'? undefined: pathname+':'+name ;
		return exports.loadDefine( define, mbrPathname ) ;
	}

	// layout
	if( define.layout!==null )
	{
		define.layout = loadMemberController( define.layout||'weblayout', 'layout' ) ;
	}

	// children
	for( var name in define.children )
	{
		define.children[name] = loadMemberController( define.children[name], name ) ;
	}

	// actions
	for( var name in define.actions )
	{
		define.actions[name] = loadMemberController( define.actions[name], name ) ;
	}


	define._initCallbacks = [] ;
	define._initialized = 0 ;
	define._initializeErr = null ;

	return define ;
}

exports.resolve = function (path)
{
	if( path in Controller._controllerAlias )
	{
		path = Controller._controllerAlias[path] ;
	}

	try{
		return require.resolve(path) ;
	}catch(err){
		if( typeof err.code=="undefined" || err.code!="MODULE_NOT_FOUND" )
		{
			throw err ;
		}
	}

	// 清理开头的斜线 和 连续的斜线
	var subnames = path.replace(/^\/+/,"").replace(/\/+/g,"/").split("/") ;
	subnames.splice(1,0,"lib") ;
	path = subnames.join("/") ;

	return require.resolve(path) ;
}

exports.init = function(controller,callback,sync)
{
	if(controller._initialized==2)
	{
		callback && callback(controller._initializeErr,controller) ;
		return ;
	}

	controller._initCallbacks.push(callback) ;

	if(controller._initialized==1)
	{
		return ;
	}

	controller._initialized = 1 ;
	controller._depsReady = false ;
	controller._imReady = false ;

	if( !sync )
	{
		sync = new exports.Sync() ;
	}

	var deps = [] ;

	// layout
	if( controller.layout )
	{
		this.init(controller.layout,null,sync) ;

		sync.dep(controller.layout) ;
	}

	// children and actions
	for(var prop in {children:1,actions:1})
	{
		if(controller[prop])
		{
			for(var name in controller[prop])
			{
				this.init(controller[prop][name],null,sync) ;

				sync.dep(controller[prop][name]) ;
			}
		}
	}

	this._loadView(controller,function(){

		sync.imReady(controller) ;

		controller._imReady = true ;
		exports._loadDone(controller) ;

	}) ;

	sync.addCallback(function(){
		controller._depsReady = true ;
		exports._loadDone(controller) ;
	}) ;
}



exports._loadView = function _loadView(controller,callback){

	function _loadViewTemplate()
	{
		TemplateCaches.singleton.template(controller.view,function(err,tpl){
			controller.viewTpl = tpl ;
			if(err)
			{
				exports._setInitErr(controller,err) ;
			}
			callback(err,controller) ;
		}) ;
	}

	if( !controller.view )
	{
		var error = null ;

		if(controller.pathname)
		{
			var tplname = controller.pathname.substr(0,controller.pathname.length-3) + '.html' ;

			try{

				var viewfullpath = require.resolve(tplname,controller.pathname) ;
				console.log(viewfullpath) ;
				fs.exists(viewfullpath,function(exists){
					console.log(exists?'exists':'not exists',viewfullpath) ;
					if(exists)
					{
						controller.view = tplname ;
						_loadViewTemplate() ;
					}
					else
					{
						controller.viewTpl = null ;
						callback && callback(null,controller) ;
					}
				}) ;

				return ;

			// 仅仅是默认的文件不存在
			}catch(err){
				if(err.code!='MODULE_NOT_FOUND')
				{
					error = err ;
				}
			}
		}

		controller.viewTpl = null ;
		exports._setInitErr(controller,error) ;
		callback && callback(error,controller) ;

		return ;
	}

	else
	{
		if( typeof controller.view!="string" )
		{
			var err = new Error("view property of Controller must be a string") ;
			exports._setInitErr(controller,err) ;
			callback && callback(null,controller) ;
			return ;
		}

		_loadViewTemplate() ;
	}
}

exports._setInitErr = function(controller,err)
{
	if(!err)
	{
		return ;
	}
	err.prev = controller._initializeErr ;
	controller._initializeErr = err ;
}
exports._loadDone = function(controller)
{
	if( !controller._depsReady || !controller._imReady )
	{
		return ;
	}

	controller._initialized = 2 ;

	// 搜集错误
	if(controller.layout && controller.layout._initializeErr)
	{
		exports._setInitErr(controller,controller.layout._initializeErr) ;
	}

	// children and actions
	for(var prop in {children:1,actions:1})
	{
		if(controller[prop])
		{
			for(var name in controller[prop])
			{
				if(controller[prop][name]._initializeErr)
				{
					exports._setInitErr(controller,controller[prop][name]._initializeErr) ;
				}
			}
		}
	}

	var callback ;
	while( callback=controller._initCallbacks.shift() )
	{
		callback(controller._initializeErr,controller) ;
	}
}



exports.Sync = function Sync()
{
	this._deps = [] ;
	this._callbacks = [] ;
}

exports.Sync.prototype.dep = function(dep,callback)
{
	// 列入依赖
	if( !dep._imReady )
	{
		if( utilarr.search(this._deps,dep)!==false )
		{
			this._deps.push(dep) ;
		}
	}
}
exports.Sync.prototype.addCallback = function(callback)
{
	if( this._deps.length )
	{
		callback && this._callbacks.push(callback) ;
	}
	else
	{
		callback && callback() ;
	}
}

exports.Sync.prototype.imReady = function(controller)
{
	var idx = utilarr.search(this._deps,controller) ;
	if( idx===false )
	{
		return ;
	}

	this._deps.splice(idx,1) ;

	if(!this._deps.length)
	{
		// 通知 callback
		var callback, cblst = this._callbacks.slice() ;
		while(callback=cblst.shift())
		{
			callback() ;
		}
	}
}