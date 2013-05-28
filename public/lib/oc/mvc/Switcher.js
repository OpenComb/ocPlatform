
(function($){

	function Switcher()
	{
		this._animates = {} ;

		this.registerAnimate('slide',slideLeft,slideRight) ;
		this.registerAnimate('modal',modalPopup) ;
		this.defaultAnimation = 'slide' ;
	}

	Switcher.prototype.replacein = function(option,newview,target,callback)
	{
		if(typeof option=='string')
		{
			option = {
				animation: option
			} ;
		}
		else if(typeof option!='object')
		{
			option = {
				animation: this.defaultAnimation
			} ;
		}

		option.animation = option.animation || this.defaultAnimation ;

		if( !(animation=this._animates[option.animation]) )
		{
			throw new Error("遇到无效的视图切换动画") ;
		}

		// 执行动画
		var switcher = this ;
		animation.func(option,newview,target,function(){

			// 调用 viewIn, viewOut
			$(newview).find('.ocview').andSelf().each(function(){

				target.viewOut && target.viewOut() ;

				this.viewIn && this.viewIn() ;
			}) ;

			// 处理网页标题
			switcher.updateHtmlMeta(newview,target) ;

			callback && callback (null,newview) ;
		}) ;
	}

	Switcher.prototype.registerAnimate = function(name,func,funcRevert)
	{
		this._animates[name] = {
			func: func
			, funcRevert: funcRevert
		}
	}

	Switcher.prototype.updateHtmlMeta = function(newview,target)
	{
		if( !jQuery(newview).parent().hasClass('oclayout-container') || !newview.nut )
		{
			return ;
		}

		var title = newview.nut.makeTitle() ;
		if( title )
		{
			$("title").html(title)
		}

		var keywords = newview.nut.makeKeywords() ;
		if( keywords )
		{
			$("meta[name=keywords]").attr('content',keywords)
		}

		var description = newview.nut.makeDescription() ;
		if( description )
		{
			$("meta[name=keywords]").attr('content',description) ;
		}
	}


	$.switcher = new Switcher ;



	////////////////////////////////////////////////////////////////
	// build in animations
	var defaultSlideSpeed = 100 ;

	/**
	 * option: {
	 * 	speed: [100]
	 * }
	 */
	function slideLeft(option,newview,target,callback)
	{
		var $target = jQuery(target) ;
		var $newview = jQuery(newview) ;

		var wrapperHtml = "<div class='ocview-switch-wapper' style='overflow: hidden'>" ;
		wrapperHtml+= "<div class='ocview-switch-animation'>" ;
		wrapperHtml+= "<div class='ocview-switch-item-target' style='float:left'></div>" ;
		wrapperHtml+= "<div class='ocview-switch-item-new' style='float:left'></div>" ;
		wrapperHtml+= "<div style='clear:both'></div>" ;
		wrapperHtml+= "</div>" ;
		wrapperHtml+= "</div>" ;
		var $wrapper = jQuery(wrapperHtml) ;

		// 设定宽高
		var targetWidth = $target.width() ;
		var targetHeight = $target.height()
		$wrapper.width(targetWidth) ;
		$wrapper.height(targetHeight) ;


		// 置入
		$target.replaceWith($wrapper) ;
		$wrapper.find(".ocview-switch-item-target").append(target) ;
		$wrapper.find(".ocview-switch-item-new").append(newview) ;

		$newview.width(targetWidth) ;
		var newHeight = $newview.height() ;
		$newview.height(targetHeight).css("overflow-y","hidden") ;

		// 开始动画
		$wrapper.find('.ocview-switch-animation')
			.width(targetWidth*2)
			.animate(
			{ "margin-left":-$target.width() }
			, option.speed || defaultSlideSpeed
			, null
			,function(){
				// 移除 wrapper
				$wrapper.replaceWith($newview) ;

				// 调整高度
				$newview.animate(
					{"height": newHeight }
					, module.exports.slidespeed
					, null
					, function(){
						// 清理状态
						$newview.css("overflow-y",'').height('') ;

						callback && callback() ;
					}
				) ;
			}
		) ;
	}

	function slideRight(option,newview,target,callback)
	{
	}


	// ---
	function modalview()
	{
		var $view = jQuery(".ocview-pjax-modal") ;
		if(!$view.length)
		{
			var $view = jQuery('<div class="ocview-pjax-modal"></div>').appendTo(document.body) ;
		}
		return $view ;
	}

	function modalPopup(option,newview,target,callback)
	{
		modalview().html('')
				.append(newview)
				.popup() ;
		callback && callback() ;
	}



})(jQuery) ;

