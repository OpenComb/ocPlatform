var Template = require("octemplate/lib/Template.js") ;

module.exports = Template.extend({

	load: function(callback)
	{
		// 加载、分析 模板
		if(!this.loaded)
		{
			if(callback)
			{
				this.once("loaded",callback) ;
			}

			if(!this.loading)
			{
				this.loading = true ;
				this._readTemplateFile() ;
			}
		}

		//
		else
		{
			callback && callback(null,this) ;
		}

		return this ;
	}

	, _readTemplateFile: function()
	{
		var ele = document.createElement("script") ;
		ele.src = "/shipdown:tpl/" + this.filePath ;
		ele.type = "text/javascript" ;
		document.getElementsByTagName("head")[0].appendChild(ele) ;
	}

}) ;


