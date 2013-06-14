Function.before = function(joint,advice)
{
	return joint? function(){
		advice.apply(this,arguments) ;
		return joint.apply(this,arguments) ;
	}: advice ;
}
Function.after = function(joint,advice)
{
	return joint? function(){
		var ret = joint.apply(this,arguments) ;
		advice.apply(this,arguments) ;
		return ret ;
	}: advice ;
}
Function.around = function(joint,advice)
{
	advice.pointcuts = joint?
						function(){
							return joint.apply(this,arguments) ;
						} :
						function(){} ;
	return advice ;
}


// for exists function
Function.prototype.before = function(advice)
{
	return Function.before(this,advice) ;
}

Function.prototype.after = function(advice)
{
	return Function.after(this,advice) ;
}

Function.prototype.around = function(advice)
{
	return Function.around(this,advice) ;
}