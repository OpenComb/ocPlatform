var Class = require("occlass/lib/Class.js") ;
var View = require("ocplatform/public/lib/oc/mvc/View.js") ;
var Nut = require("ocplatform/lib/mvc/Nut.js") ;
var Step = require("step") ;
var utilstr = require("ocplatform/lib/util/string.js") ;

(function(jQuery){

	function Director($document)
	{
		this.$document = $document || jQuery(document) ;
		this._request = null ;
		this.enable = true ;
		this._stateQueue = [] ;
		this._currentState ;
	}

	Director.prototype.setup = function($)
	{
		var director = this ;

		// 当前网页中的元素事件
		function onRequestElement(event)
		{
			if( !director.enable || jQuery(event.target).attr("target") )
			{
				return ;
			}

			if(event)
			{
				// 事件已经停止
				if(event.returnValue===false)
				{
					return ;
				}

				event.returnValue = false ;
			}

			jQuery(this).request() ;

			// 取消浏览器默认行为
			return false ;
		}

		// for link(a tag)
		this.$document.on("click","a.stay,a.stay-view,a.stay-top,a.stay-lazy,a.stay-action,a.stay-modal",onRequestElement) ;

		// for form
		this.$document.on("submit","form.stay,form.stay-view,form.stay-top,form.stay-lazy,form.stay-action,a.stay-modal",onRequestElement) ;

		// state 事件
		window.onpopstate = function(e) {

			if(e.state && e.state.ocstate && director._currentState)
			{
				//console.log('current',director._currentState) ;
				//console.log('popup',e.state) ;

				// 失败，可能是 history state 链因为网页被刷新，或释放缓存等原因缺少视图信息
				if( !director._moveOnHistoryQueue(e.state) )
				{
					// 加载控制器，重新获取视图
					if(e.state.data && e.state.data.constructor!==Array)
					{
						var data = [] ;
						for(var name in e.state.data)
						{
							data.push({name:name,value:e.state.data[name]}) ;
						}
						e.state.data = data ;
					}
				
					director.request(
						{
							url: e.state.url
							, data: e.state.data || []
						}
						, {
							target: 'lazy'
							, historyStateIndex: e.state.index
						}
					) ;

					director._currentState = e.state ;
				}
			}
		} ;

		// 处理首次请求
		if( window.history.replaceState )
		{
			if(!window.history.state||!window.history.state.ocstate)
			{
				var state = {
					url: location.pathname
					, data: queryStrings(location.search)
					, ocstate: true
					, index: 0
				} ;
				window.history.replaceState(state,null) ;
				this._stateQueue[state.index] = state ;
				this._currentState = state ;
			}
			// 可能是用户刷新网页
			else
			{
				this._currentState = window.history.state ;
			}
		}
	}

	Director.prototype._moveOnHistoryQueue = function(state)
	{
		// 后退
		if( this._currentState.index > state.index )
		{
			var reserts = this._stateQueue.slice(state.index+1,this._currentState.index+1) ;

			// history state 链断掉
			if(!reserts.length)
			{
				return false ;
			}

			for(var i=reserts.length-1;i>=0;i--)
			{
				var _state = this._stateQueue[ reserts[i].index ] ;

				if(!_state || !_state.newview || !_state.target)
				{
					// history state 链断掉
					return false ;
				}
				else
				{
					// 无动画还原后续state
					if(i)
					{
						jQuery(_state.newview).replaceWith(_state.target) ;
					}
					else
					{
						// 动画还原最近一个state
						jQuery.switcher.replacein(undefined,_state.target,_state.newview) ;
					}
				}
			}

			this._currentState = state ;
		}

		// 前进
		else if(this._currentState.index < state.index)
		{
			var reserts = this._stateQueue.slice(this._currentState.index+1,state.index+1) ;

			// history state 链断掉
			if(!reserts.length)
			{
				return false ;
			}

			for(var i=0;i<reserts.length;i++)
			{
				var _state = this._stateQueue[ reserts[i].index ] ;

				if(!_state || !_state.newview || !_state.target)
				{
					// history state 链断掉
					return false ;
				}
				else
				{
					// 无动画还原后续state
					if( i<reserts.length-1 )
					{
						jQuery(_state.target).replaceWith(_state.newview) ;
					}

					// 动画应用最后一个state
					else
					{
						jQuery.switcher.replacein(undefined,_state.newview,_state.target) ;
					}

					this._currentState = _state ;
				}
			}

			this._currentState = state ;
		}

		return true ;
	}

	/**
	 * 根据传入的 "then" 参数，构建 ajax 对象
	 */
	Director.buildParamThen = function(then,element)
	{
		if(then===undefined)
		{
			// 从elemt
			if(element)
			{
				$element = $(element) ;				
				var staytarget = $element.attr("stay-target") ;
				if( staytarget )
				{
					then = staytarget ;
				}
				else
				{
					if( $element.hasClass('stay-top') )
					{
						then = 'top' ;
					}
					else if( $element.hasClass('stay-view') )
					{
						then = 'view' ;
					}
					else if( $element.hasClass('stay-action') )
					{
						then = 'action' ;
					}
					else if( $element.hasClass('stay-modal') )
					{
						then = 'modal' ;
					}
					else
					{
						then = 'lazy' ;
					}
				}
			}
			else
			{
				then = 'lazy' ;
			}
		}

		var type = typeof then ;
		if( type=='string' )
		{
			then = {
				target: then || 'lazy'
			}
		}
		else if( type=='function' )
		{
			then = {
				callback: then
			}
		}

		// 一个document中的有效元素
		else if( then && then.ownerDocument )
		{
			then = {
				target: then
			}
		}
		else if( type!='object' )
		{
			console.log("you give me a inavlid param 'then'") ;
			return {} ;
		}

		
		if( typeof then.target=='string' )
		{
			switch(then.target)
			{
				case 'view' :
					if(element)
					{
						then.target = jQuery(element).parents(".ocview")[0] || null ;
					}
					else
					{
						then.target = null ;
					}
					break ;

				case 'top' :
					then.target = jQuery(jQuery(ele).parents(".oclayout")[0]).find(".ocview")[0] || null ;
					break ;

				case 'action' :
					then.callback = function(err,nut){
						err && console.log(err) ;
						nut.msgqueue && nut.msgqueue.popup() ;
					}
					then.target = undefined ;
					break ;
					
				case 'modal' :
					then.target = this.modalview() ;
					then['switch'] = "modal" ;
					break ;
					
				case 'lazy' :
				case 'default' :
					then.target = null ;
					break ;

				// selector
				default:
					then.target = jQuery(then.target)[0] || null ;
					break ;
			}
		}
		
		return then ;
	}

	function searchData(data,name)
	{
		for(var i=0;i<data.length;i++)
		{
			if( data[i].name==name )
			{
				return i ;
			}
		}
		return false ;
	}
	function dataValue(data,name)
	{
		var idx = searchData(data,name) ;
		if( idx===false )
		{
			return undefined ;
		}
		else
		{
			return data[idx].value ;
		}
	}

	/**
	 * 向服务器发送请求，并从服务器取回 nut 对象
	 */
	Director.prototype.request = function(ajaxOptions,thenOptions)
	{
		if(!ajaxOptions)
		{
			throw new Error("missing param ajaxOptions") ;
		}
		if(typeof ajaxOptions=='string')
		{
			ajaxOptions = {
				url: ajaxOptions
			}
		}
		if(!ajaxOptions.url || ajaxOptions.url[0]=='#')
		{
			console.log("ignore a empty url request") ;
			return ;
		}
		// 将 controllerpath 形式，转换为"/"开头的url绝对路径
		if( ! /^(https?:\/\/|\/)/.test(ajaxOptions.url) )
		{
			ajaxOptions.url = '/' + ajaxOptions.url ;
		}

		var director = this ;

		// 构建 then 参数
		thenOptions = Director.buildParamThen(thenOptions) ;

		var ajax = ajaxOptions || {} ;
		ajax.dataType = 'json' ;
		ajax.beforeSend = function(req)
		{
			// 一次只请求一个视图
			if(director._request)
			{
				director._request.abort() ;
			}

			// 显示 loading
			director.showViewLoading() ;

			// this time
			director._request = req ;
		} ;

		// ajax data
		ajax.data = ajax.data || [] ;

		if(ajax.data.constructor!==Array)
		{
			throw new Error("Director.request()的参数 ajaxOptions.data 必须是 Array") ;
		}

		// 根据 thenOptions.target 为 lazy 模式，且 ajaxOptions中未指定 @layout
		if( thenOptions.target!==null && searchData(ajax.data,"@layout")===false )
		{
			ajax.data.push({name:"@layout",value:"false"}) ;
		}

		// 如果需要执行 layout, 则提供 sumsign
		if( dataValue(ajax.data,"@layout")!='false' && searchData(ajax.data,"@sumsign")===false )
		{
			var sumsigns = [] ;
			jQuery(".oclayout[sumsign]").each(function(){
				sumsigns.push( jQuery(this).attr("sumsign") ) ;
			}) ;
			if(sumsigns.length)
			{
				ajax.data.push({name:"@sumsigns",value:sumsigns.join(',')})
			}
		}

		if(searchData(ajax.data,"@render")===false)
		{
			ajax.data.push({name:"@render",value:"false"}) ;
		}

		var callback = ajax.success ;
		ajax.success = function(nut)
		{
			callback && callback.apply(this,arguments) ;

			Nut.restore(nut,function(err,nut){

				if(err)
				{
					thenOptions.callback && thenOptions.callback(err) ;
					throw err ;
				}

				director.then(nut,thenOptions,ajax) ;
			}) ;
		}

		var cusComplete = ajax.complete ;
		ajax.complete = function()
		{
			// 关闭 loading
			director.hideViewLoading() ;

			cusComplete && cusComplete.apply(this,arguments) ;
		}

		ajax.error = function(err)
		{
			callback && callback.apply(this,arguments) ;
		}


		if( ajax.data.constructor===Array )
		{
			for(var name in ajax.data)
			{
				// exclude length property of Array
				if( ! /^[0-9]+$/.test(name) && name!="length")
				{
					ajax.data.push( {name:name,value:ajax.data[name]} ) ;
					ajax.data[name] = undefined ;
					delete ajax.data[name] ;
				}
			}
		}
		else
		{
			var data = [] ;

			for(var name in ajax.data)
			{
				data.push( {name:name,value:ajax.data[name]} ) ;
			}

			ajax.data = data ;
		}
		// console.log(ajax.data) ;

		// 发送请求
		return jQuery.ajax(ajax) ;
	}


	/**
	 * 在 Director.request() 从服务器取得 nut 后，
	 * 接着处理后续事务
	 */
	Director.prototype.then = function(nut,thenOpt,ajaxReq)
	{		
		if(thenOpt.target===null)
		{
			thenOpt.target = this.compareLayoutStruct(nut) ;
		}

		var director = this ;

		// 剥开果壳 :)
		nut.crack(function(err,html){
			if(err)
			{
				console.log(err.message) ;
				console.log(err.stack) ;

				thenOpt.callback && thenOpt.callback(err,nut) ;
				return ;
			}

			// 导入视图中引用的 css
			var assets = nut.view.assets ;
			for(var i=0;i<assets.css.length;i++)
			{
				jQuery(document.head).append('<link type="text/css" href="'+assets.css[i]+'" rel="stylesheet">') ;
			}

			// 创建视图
			var $rootview = jQuery(html,document.ownerDocument) ;
			Step(
				function buildViews(){
					var group = this.group() ;

					$rootview.find('.ocview').andSelf().each(function(){
						View.buildView(this,jQuery.shipper,group()) ;
						this.nut = nut ;
						this.ajaxOpt = ajaxReq ;
					}) ;
				}
				, function placeInViews(err){
					if(err)
					{
						console.log(err) ;
						thenOpt.callback && thenOpt.callback(err,nut,$rootview) ;
					}

					// 切换视图
					if( thenOpt.target )
					{
						$.switcher.replacein(undefined,$rootview[0],thenOpt.target,this) ;
					}
					else
					{
						return 1 ;
					}
				}

				, function done(err){
					if(err)
					{
						console.log(err.stack) ;
					}

					// pjax 历史记录
					director.insertState(ajaxReq,thenOpt,$rootview[0],thenOpt.target) ;

					thenOpt.callback && thenOpt.callback(err,nut,$rootview) ;
				}
			)

		}) ;
	}

	Director.prototype.insertState = function(ajaxReq,thenOpt,newView,target)
	{
		if( thenOpt.history===false )
		{
			return ;
		}

		// console.log(ajaxReq) ;
		var info = utilstr.parseUrl(ajaxReq.url) ;
		var search = [] ;
		for(var name in info.params)
		{
			if(name[0]!='@')
			{
				search.push( name+'='+info.params[name] ) ;
			}
		}
		if(ajaxReq.data)
		{
			for(var i=0;i<ajaxReq.data.length;i++)
			{
				var name = ajaxReq.data[i].name ;
				if(name[0]!='@')
				{
					search.push( name+'='+ajaxReq.data[i].value ) ;
				}
			}
		}
		var url = info.protocol + '://' + info.host + (info.port? (':'+info.port):'') + info.path ;
		if( search.length )
		{
			url+= '?' + search.join('&') ;
		}
		// console.log("history",ajaxReq.url,ajaxReq.data,'=>',url) ;
		
		//console.log("history.state = ",history.state,(history.state&&history.state.index)) ;
		var state = {
				url: url
				, data: ajaxReq.data
				, type: ajaxReq.type
				, ocstate: true
				, index: thenOpt.historyStateIndex!==undefined?
									thenOpt.historyStateIndex: 
									((history.state&&history.state.index)||0) + 1
			} ;
		console.log("then",state) ;	
		if( thenOpt.historyStateIndex===undefined )
		{
			window.history.pushState && window.history.pushState( state, null, url ) ;
		}

		state.target = target ;
		state.newview = newView ;
		this._stateQueue[state.index] = state ;
		this._currentState = state ;
		//console.log('_currentState = ',state) ;

		// 清除后面的缓存
		if(this._stateQueue.length>state.index+1)
		{
			this._stateQueue.splite(state.index+1) ;
		}
	}

	/**
	 * 比较 nut 中的layout结构 和 当前浏览器中的layout结构，
	 * 确定哪些 layout 不需要被更新，
	 * 一旦确定，无需更新的layout信息会从 nut 中移除，
	 * 返回需要更新的最外层视图
	 */
	Director.prototype.compareLayoutStruct = function(nut)
	{
		var target = (function findAvailLayout( nut )
		{
			if( nut._children && nut._children.layout )
			{
				var $layout = jQuery("[sumsign="+nut._children.layout.model['$sumsign']+"]") ;
				// bingo !
				if( $layout.length )
				{
					delete nut._children.layout ;

					// just here !
					return $layout.find(".oclayout-container>.ocview")[0] ;
				}
				else
				{
					return findAvailLayout(nut._children.layout) ;
				}
			}

			return null ;
		}) (nut) ;

		// 返回找到的，或最上层的 ocview
		return target || jQuery(".ocview")[0] ;
	}

	Director.prototype.showViewLoading = function()
	{
		this.viewLoadingWidget().fadeIn(300) ;
		return this ;
	}

	Director.prototype.hideViewLoading = function()
	{
		this.viewLoadingWidget().fadeOut(400) ;
		return this ;
	}

	Director.prototype.viewLoadingWidget = function()
	{
		var $widget = jQuery(".ocview-loading") ;
		return $widget.length? $widget: this.createViewLoading() ;
	}

	Director.prototype.createViewLoading = function()
	{
		var $widget = jQuery('<div class="ocview-loading" style="position: fixed; z-index: 1000;"><img src="/ocplatform/public/style/images/github-loading.gif" ></div>')
						.appendTo(document.body) ;

		function loadingPlace()
		{
			// console.log(document.body.clientHeight,$widget.outerHeight(),document.body.clientHeight/2 - $widget.outerHeight()/2) ;
			$widget.css({
				left: (document.body.clientWidth/2 - $widget.outerWidth()/2 ) + 'px'
				, top: (document.body.clientHeight/2 - $widget.outerHeight()/2 ) + 'px'
			}) ;
		}
		loadingPlace() ;
		
		jQuery(window).resize(loadingPlace) ;

		return $widget ;
	}

	var queryStrings=function(query) {
		var params=query,reg=/(?:^\?|&)(.*?)=(.*?)(?=&|$)/g,temp,args={};
		while((temp=reg.exec(params))!=null) args[temp[1]]=decodeURIComponent(temp[2]);
		return args;
	};



	// -----------------------------------------------------------------
	// jQuery plugin functions
	//
	jQuery.director = new Director() ;

	/**
	 * jQuery.director.request() 的别名
	 */
	jQuery.request = function()
	{
		return this.director.request.apply(this.director,arguments) ;
	}

	jQuery.controller = function(url,data,thenOpts)
	{
		var ajaxOpts = typeof url=='string'? {url:url}: (url||{}) ;
		ajaxOpts.data = data ;

		jQuery.request(ajaxOpts,thenOpts) ;
	}

	jQuery.action = function(url,data,thenOpts)
	{
		if(!thenOpts)
		{
			thenOpts = {
				callback: function(err,nut)
				{
					if(err)
					{
						console.log(err) ;
					}
					nut.msgqueue && nut.msgqueue.popup() ;
				}
			}
		}
		else if( typeof thenOpts=='string' )
		{
			var selector = thenOpts ;
			thenOpts = {
				callback: function(err,nut)
				{
					if(err)
					{
						console.log(err) ;
					}
					nut.msgqueue && nut.msgqueue.renderAndAppendTo(selector) ;
				}
			}
		}

		var ajaxOpts = typeof url=='string'? {url:url}: (url||{}) ;
		ajaxOpts.data = data ;

		jQuery.request(ajaxOpts,thenOpts) ;
	}

	/**
	 * 这是一个 jQuery 函数
	 * use: jQuery('selector').request() ;
	 */
	jQuery.fn.request = function(ajaxOptions,thenOptions,asForm)
	{
		if( !this.length )
		{
			return ;
		}
		if( this.constructor!==jQuery )
		{
			throw new Error("$.fn.request() only called on a jQuery array") ;
			return ;
		}
		
		ajaxOptions = ajaxOptions || {} ;
		thenOptions = Director.buildParamThen(
						thenOptions
						, this[0]
					) ;

		var tagName = this[0].tagName.toUpperCase() ;
		
		

		// 链接
		if( tagName == 'A' )
		{
			ajaxOptions.url = this.attr("href") || ajaxOptions.url ;
		}

		// 表单
		else if( tagName == 'FORM' || asForm || this.hasClass('form') )
		{
			ajaxOptions.url = this.attr("action") || ajaxOptions.url ;
			ajaxOptions.type = this.attr("method") || ajaxOptions.type || 'GET' ;
			ajaxOptions.contentType = this.attr("enctype") || ajaxOptions.contentType || "application/x-www-form-urlencoded" ;

			// jQuery.serializeArray() 仅对 form 有效
			if( tagName=='FORM' )
			{
				var data = jQuery(this[0]).serializeArray() ;
			}
			else
			{
				var data = this.serializeArrayNotform() ;
			}

			if( ajaxOptions.data && !_.isArray(ajaxOptions.data) )
			{
				for(var name in ajaxOptions.data)
				{
					data.push({name:name,value:ajaxOptions.data[name]}) ;
				}
			}
			ajaxOptions.data = data ;

//			this.find('input[name],select[name],textarea[name],checkbox[name][checked]').each(function(){
//				ajaxOptions.data[ jQuery(this).attr('name') ] = jQuery(this).val() ;
//			}) ;
		}

		else
		{
			throw new Error("$.fn.request() only call as a method of A or FORM element") ;
			return ;
		}

		jQuery.director.request( ajaxOptions, thenOptions ) ;
	}


	jQuery.fn.serializeArrayNotform = function()
	{
		var data = [] ;
		this.find("input[name],select[name],textarea[name]").each(function(){
			var iptname = $(this).attr("name") ;
			switch(this.tagName)
			{
				case 'INPUT' :
					switch( ($(this).attr("type")||"text").toLowerCase() )
					{
						case 'checkbox':
						case 'radio':
							if( $(this).attr('checked') )
							{
								data.push( {name:iptname,value:$(this).val()} ) ;
							}
							break ;
						default :
							data.push( {name:iptname,value:$(this).val()} ) ;
							break ;
					}
					break ;

				case 'SELECT' :

					for(var i=0;i<this.options; i++)
					{
						var option = this.options[i] ;
						if( option.attr("selected") )
						{
							data.push( {name:iptname,value:$(option).val()} ) ;
						}
					}
					break ;

				case 'TEXTAREA' :
					data.push( {name:iptname,value:$(this).val()} ) ;
					break ;
			}
		}) ;

		return data ;
	}


}) (jQuery) ;
