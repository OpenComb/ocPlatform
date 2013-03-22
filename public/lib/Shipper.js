
var Shipper = function()
{
	this._moduleCache = {} ;
	this._loadings = [] ;
	this._callbacks = [] ;
}

Shipper.prototype.require = function(path,callback)
{
	var shipper = this ;

	util.array.pushIfNotExists(this._loadings,path) ;
	this._callbacks.push(callback) ;

	var cache = this.cache(path,true) ;
	cache.download( function moduelDownloaded(err,downloadedcache){
		// console.log(downloadedcache.path,shipper._loadings) ;

		util.array.remove(shipper._loadings,downloadedcache.path) ;

		for(var i=0;i<downloadedcache.deps.length;i++)
		{
			var depcache = shipper.cache(downloadedcache.deps[i],true) ;
			// console.log("	require module ",downloadedcache.deps[i]," ",depcache.downloaded? "loaded": "unloaded") ;

			if(!depcache.downloaded && !depcache.downloading)
			{
				//console.log("	start loading") ;

				util.array.pushIfNotExists(shipper._loadings,downloadedcache.deps[i]) ;
				depcache.download(moduelDownloaded) ;
			}
		}

		// all modules downloaded
		if(!shipper._loadings.length)
		{
			while(callback=shipper._callbacks.shift())
			{
				callback(null,path,cache) ;
			}
		}

	} ) ;
}

Shipper.prototype.module = function(path)
{
	var cache = this.cache(path,false) ;
	if(!cache)
	{
		throw new Error("cound not found module under frontend : "+path) ;
	}
	return cache.load() ;
}

Shipper.prototype.cache = function(path,create)
{
	if( typeof this._moduleCache[path]!="undefined" )
	{
		if(this._moduleCache[path].error)
		{
			throw new Error(this._moduleCache[path].error) ;
		}
		else
		{
			return this._moduleCache[path] ;
		}
	}
	if( !create )
	{
		return null ;
	}

	return this._moduleCache[path] = new ShipModuleCache(this,path) ;

}
Shipper.prototype.downloaded = function(err,path,deps,func)
{
	if(err)
	{
		this.cache(path,true)._onDownloaded(err,[],function(){}) ;

		var modules = this.revertQueryDep(path) ;
		if(modules.length)
		{
			err+= " , and these modules depended it : \"" + modules.join("\", \"") + '"' ;
		}

		throw new Error(err) ;
	}
	else
	{
		this.cache(path,true)._onDownloaded(null,deps,func) ;
	}
}
Shipper.prototype.revertQueryDep = function(dep)
{
	var modules = [] ;

	for(var key in this._moduleCache)
	{
		if(this._moduleCache[key].deps)
		{
			for(var l=0;l<this._moduleCache[key].deps.length;l++)
			{
				if( this._moduleCache[key].deps[l] == dep )
				{
					modules.push(key) ;
					break ;
				}
			}
		}
	}

	return modules ;
}

Shipper.prototype.createScript = function(src,load)
{
	var ele = document.createElement("script") ;
	ele.src = src ;
	ele.type = "text/javascript" ;
	if(load)
	{
		document.head.appendChild(ele) ;
	}
	return ele ;
}




function ShipModuleCache (shipper,path)
{
	this.deps = null
	this.func = null
	this.module = {
		exports: {}
		, loaded: false
		, filename: path
	} ;

	this.downloaded = false
	this.downloading = false
	this.waitingDownloadCallbacks = []
	this.path = path ;



	this.download = function(callback)
	{
		if(this.downloaded)
		{
			callback(null,this) ;
			return ;
		}

		this.waitingDownloadCallbacks.push(callback) ;

		if(!this.downloading)
		{
			this.downloading = true ;
			shipper.createScript("/shipdown/"+path,true) ;
		}
	}

	this._onDownloaded = function(err,deps,func)
	{
		this.deps = deps ;
		this.func = func ;
		this.error = err ;

		this.downloading = false ;
		this.downloaded = true ;

		// 通知 callback
		var callback ;
		while(callback=this.waitingDownloadCallbacks.shift())
		{
			callback(null,this) ;
		}
	}

	this.load = function()
	{
		if(this.module.loaded)
		{
			return this.module.exports ;
		}

		function require(path)
		{
			return shipper.module(path) ;
		}
		require.resolve = function()
		{
			throw new Error("can not call require.resolve() in browser .") ;
		}

		if(!this.func)
		{
			throw new Error("module has no func ? "+this.path) ;
		}

		var err = null ;
		try{
			this.func.apply(null,[
				require
				, this.module
				, this.module.exports
				, null
				, this.module.filename
			]) ;
		}catch(e){
			err = e ;
		}

		this.module.loaded = true ;

		if(err)
		{
			throw err ;
		}

		return this.module.exports ;
	}

}





var util = {
	array: {
		search: function(arr,ele)
		{
			for(var i=0;i<arr.length;i++)
			{
				if( arr[i] == ele )
				{
					return i ;
				}
			}

			return false ;
		}
		, remove: function(arr,ele)
		{
			var idx = util.array.search(arr,ele) ;
			if(idx!==false)
			{
				arr.splice(idx,1) ;
			}
		}
		, pushIfNotExists: function(arr,ele)
		{
			if(util.array.search(arr,ele)===false)
			{
				arr.push(ele) ;
			}
		}
	}
}