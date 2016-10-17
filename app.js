//Begin const ---------------------------------------------

var NB_RAMPES = 8;			//nb rampe to manage
var SERVER_PORT = 8989;		//http port
var TEMP_FAN = 20;		//T° to set ON fan
var TEMP_ATTENUATION = 23.5;	//T° to set attenuation ON
var ATTENUATION_SCALE = 5;		//attenuation factor = -10%
var CHECK_PERIOD = 10;		//check period in seconds
var ON = 0;					//relay card inverse ?
var OFF = 1;				//relay card inverse ?
var DEBUG = 0;				//debug mode
var LOG = 1;				//log mode
var TPS = [					// Time Periods definition
	{ hour: '08:00', blue:   0, white:   0 },
	{ hour: '10:00', blue:  10, white:  20 },
	{ hour: '11:00', blue:  80, white:  70 },
	{ hour: '15:00', blue: 100, white:  90 },
	{ hour: '17:00', blue:  80, white:  90 },
	{ hour: '20:00', blue:  60, white:  50 },
	{ hour: '24:00', blue:   0, white:  10 }
];

//global
var attenuationLoop = [];
for (var i=1; i <= NB_RAMPES; i++) { attenuationLoop[i]=0; }

//End const -----------------------------------------------

//Begin Required libraries --------------------------------

//Server & socket
var express = require('express');
app = express();
server = require('http').createServer(app);
io = require('socket.io').listen(server);
server.listen(SERVER_PORT);				//start server
app.use(express.static('public'));		//static page

//Gpio
var Gpio = require('onoff').Gpio; 				// Constructor function for Gpio objects. (need npm install rpio)
var gpioRelay = [];
for (i=1; i<=NB_RAMPES; i++) {
	if (DEBUG) { console.log("init gpioRelay "+i); }
	gpioRelay[i-1] = new Gpio(i+10, 'out');     // Export GPIO #11-18 as an output for Relay Fan
	gpioRelay[i-1].writeSync(OFF);				//set off
}

//Raspberry ServoPi
var servopi = require('./ABElectronics_NodeJS_Libraries/lib/servopi/servopi');
var pwm = new ServoPi(0x40);	// create an servopi object
pwm.setPWMFrequency(1000);		// Set PWM frequency to 1 Khz and enable the output
pwm.outputEnable();

//TimePeriod
var moment = require('moment');						//http://momentjs.com/docs
var twix = require('twix');							//http://isaaccambron.com/twix.js/
var dateFormat = require('dateformat');				//https://github.com/felixge/node-dateformat

//Temperature
var sensor = require('ds18x20');					//https://www.npmjs.com/package/ds18x20
var rampeSensors = sensor.list();
if (DEBUG) { console.log('T° Sensors Adr', rampeSensors); }
var allRampeT = sensor.get(rampeSensors);			//sync
if (LOG) { console.log('All T°', allRampeT); }

//End Required libraries ----------------------------------

//Begin managing hardware ---------------------------------

//manage Temperature Sensors
var getRampeT = function(sensorAdr) {
	try {
		temp = sensor.get(sensorAdr);
	} catch (err) {	//if no sensor
		temp = 0;
	}
	if (DEBUG) {  console.log("T° of "+sensorAdr+"="+temp); }
	return temp;
}

//manage relay
function setRelay(num, state) {
	//if (DEBUG) { console.log("setRelay n°"+num+" => "+state); }
	actual = gpioRelay[num-1].readSync();
	if ( actual != state ) {
		if (DEBUG) { console.log("setRelay "+num+"("+actual+") changing to "+state); }
		gpioRelay[num-1].writeSync(state);
	} else {
		if (DEBUG) { console.log("setRelay "+num+"("+actual+") already "+state); }
	}
}

//manage pwm Led
function setPwmLed(pwm, num, brightness) {
	pwm_bright = Math.round(4095 - brightness * 4095 / 100);	//inverse for LDD SureElectronic
    pwm.setPWM(num-1, 0, pwm_bright);							//pin n°num (pwm 0-15 = pin 1-16)
    if (DEBUG) { console.log(num+'-auto) brightness='+brightness+'% pwm='+pwm_bright); }
}

//manage pwm Rampe
function setPwmRampe (pwm, num, ratio) {	// = manage 2 LED
	//rampe n°1 = pwm 1 & pwm 2		//rampe n°2 = pwm 3 & pwm 4		//...		//rampe n°8 = pwm 15 & pwm 16
	setPwmLed(pwm, 2*num-1, ratio.blue);
	setPwmLed(pwm, 2*num,   ratio.white);		
}
//End managing hardware -----------------------------------

//Begin managing web request ------------------------------

//manage relay switch
function manageWebRelaySwitch(socket, num) {
	var newValue = OFF;
	var relayName = 'relayswitch'+num;
	socket.on(relayName, function(data){
		if (DEBUG) { console.log(num+"-web0 relayswitch !!!!!!!!!! =>"+data.state); }
		if (data.state==OFF) {	
			newValue = ON;
		}
		setRelay(num, newValue);
		if (DEBUG) { console.log(num+"-web1 relayswitch !!!!!!!!!! =>"+newValue); }
		io.sockets.emit(relayName, {state: newValue});
	});
	socket.emit(relayName, {state: newValue});	//init a 0
}

//manage % with slider & socket
function manageWebLed(socket, pwm, num) {
	var brightness = 0;
	var pwm_bright = 4095 - brightness * 4095 / 100;
	var ledName = 'led'+num; 	// led n°pwm
	socket.on(ledName, function(data) {
		brightness = data.value;		
        //brigthness de 0 a 100
        pwm_bright = 4095 - brightness * 4095 / 100;	//inverse pour LDD SureElectronic
        pwm.setPWM(num-1, 0, pwm_bright);				//pin n°num (pwm 0-15 = pin 1-16)
        if (DEBUG) { console.log(num+'-web) brightness='+brightness+'% pwm='+pwm_bright); }
		io.sockets.emit(ledName, {value: brightness});	
	});	
	//if (DEBUG) { console.log(num+'-web-init) brightness='+brightness+'% pwm='+pwm_bright); }
	//socket.emit(ledName, {value: brightness});	
}
function manageWebRampe(socket, pwm, num) {
	//rampe n°1 = pwm 1 & pwm 2		//rampe n°2 = pwm 3 & pwm 4	//...	//rampe n°8 = pwm 15 & pwm 16
	manageWebLed(socket, pwm, 2*num-1);
	manageWebLed(socket, pwm, 2*num);
}

//manage % with auto-ratio & socket
function manageWebLedRatio(socket, num, brightness) {
	var ledName = 'led'+num;
	socket.emit(ledName, {value: brightness});
}
function manageWebRampeRatio(socket, num, ratio, rampeInfos) {
	manageWebLedRatio(socket, 2*num-1, ratio.blue);
	manageWebLedRatio(socket, 2*num,   ratio.white);

	var rampeName = 'rampe' + num;
	io.sockets.emit( rampeName, {temp: rampeInfos.temp,relay: rampeInfos.relay, attenuation: rampeInfos.attenuation, infos:rampeInfos.infos} );
}
//End managing web request --------------------------------

//Begin main program--- -----------------------------------

//get ratio pwm for 1 specific hour
function getPwm(hour) {	
	if (LOG) { console.log("Looking for TP (" + hour + ") -----------------"); }
	var rampe_pwm = { blue: -1, white: -1};
	if ( !(TPS[0].hour < hour && hour < TPS[TPS.length-1].hour) ) {	//hour is in implicit period (night)
		tp1 = TPS[TPS.length-1];
		tp2 = TPS[0];
		if (DEBUG) { console.log( 'night: ' + hour + " (" + TPS[TPS.length-1].hour + "-" + TPS[0].hour +")" ); }
		if (LOG) { console.log('TP1-TP2', tp1, tp2 ); }
		var ratio = ratioPwm(tp1, tp2, hour);
	} else {	//find hour in TPS
		for( i = 0; i < TPS.length-1; i++ ) {
			tp1 = TPS[i];
			tp2 = TPS[i+1];
			if ( tp1.hour <= hour  && hour < tp2.hour) {
				if (DEBUG) { console.log( tp1.hour + " <= " + hour + " < " + tp2.hour); }
				if (LOG) { console.log( 'TP1-TP2', tp1, tp2 ); }
				var ratio = ratioPwm(tp1, tp2, hour);
			}
		}
	}
	return ratio;
}

//get TimePeriod of 1 specific hour
function getTP(hour) {	
	if (DEBUG) { console.log("Looking for TP (" + hour + ") -----------------"); }
	var tp = {}
	if ( !(TPS[0].hour < hour && hour < TPS[TPS.length-1].hour) ) {	//hour is in implicit period (night)
		tp1 = TPS[TPS.length-1];
		tp2 = TPS[0];
		if (DEBUG) { console.log( 'night: ' + hour + " (" + TPS[TPS.length-1].hour + "-" + TPS[0].hour +")" ); }
		if (DEBUG) { console.log('TP1-TP2', tp1, tp2 ); }
		tp = {tp1, tp2};
	} else {	//find hour in TPS
		for( i = 0; i < TPS.length-1; i++ ) {
			tp1 = TPS[i];
			tp2 = TPS[i+1];
			if ( tp1.hour <= hour  && hour < tp2.hour) {
				if (DEBUG) { console.log( tp1.hour + " <= " + hour + " < " + tp2.hour); }
				if (DEBUG) { console.log( 'TP1-TP2', tp1, tp2 ); }
				tp = {tp1, tp2};
			}
		}
	}
	return tp;
}

//ratio calcul
function ratioPwm(tp1, tp2, hour) {
	var duree_tp = moment("2000-01-01T" + tp1.hour).twix("2000-01-01T" + tp2.hour).count('minutes')-1;	//nb minutes of time period
	if ( duree_tp < 0 ) {	//momment lost in calcul in case 23:00-08:00
		var duree_tp_before00h = moment("2000-01-01T" + tp1.hour).twix("2000-01-01T24:00").count('minutes')-1;
		var duree_tp_after00h = moment("2000-01-01T00:00").twix("2000-01-01T"  + tp2.hour).count('minutes')-1;
		if (DEBUG) { console.log("night detected !" + duree_tp_before00h + "+" + duree_tp_after00h); }
		duree_tp = duree_tp_before00h + duree_tp_after00h;
		
		if ( tp1.hour <= hour && hour <= "24:00" ) {
			var duree_hour_before00h = moment("2000-01-01T" + hour).twix("2000-01-01T24:00").count('minutes')-1;		//nb minutes since time period begin
			var duree_hour_after00h = 0;			
		} else {
			var duree_hour_before00h = moment("2000-01-01T" + tp1.hour).twix("2000-01-01T24:00").count('minutes')-1;
			var duree_hour_after00h = moment("2000-01-01T00:00").twix("2000-01-01T" + hour).count('minutes')-1;			//nb minutes since time period begin
		}
		var duree_hour = duree_hour_before00h + duree_hour_after00h;
	} else {
		var duree_hour = moment("2000-01-01T" + tp1.hour).twix("2000-01-01T" + hour).count('minutes')-1;				//nb minutes since time period begin
	}

	//ratio 1 min = % increase/decrease by minute
	ratio_1min = {
			blue: Math.round( (tp2.blue-tp1.blue)/duree_tp * 100 ),
			white: Math.round( (tp2.white-tp1.white)/duree_tp * 100 ),
	}	
	if (DEBUG) { console.log( "TP:" + duree_tp ); console.log( "Hour:" + duree_hour + " min"); console.log( ratio_1min ); }

	//ratio in %
	ratio = { 
		blue:  Math.round( (ratio_1min.blue * duree_hour)/100 + tp1.blue ),
		white: Math.round( (ratio_1min.white * duree_hour)/100 + tp1.white ) 
	}
	return ratio;
}

//Manage All Ramp
function manageAutoAllRampes() {
	var now = new Date();
	now_hour = dateFormat(now, "HH:MM");

	var ratio = getPwm( now_hour );		//check Time Period Ratio
	var tp = getTP( now_hour );			//check Time Period
	if (DEBUG) { console.log('Ratio wanted',ratio); }

	for (var i=1; i <= NB_RAMPES; i++) {		//8 rampes
		if (DEBUG) { console.log("Rampe n°"+i+"..............."); }
		var relay = -1;
		var attenuation = 0;
		var attenuationFactor = 0;		

		var tempRampe = getRampeT( rampeSensors[i-1] );
		//switch ventilo on/off ?
		if ( tempRampe >= TEMP_FAN) {
			relay = ON;
		} else {
			relay = OFF;
			attenuationLoop[i]=0;
		}
		if (DEBUG) { console.log("Relay T° rampe n°"+i+": T° rampe:"+tempRampe+" (max:"+TEMP_FAN+") Ventilo: "+relay); }
		setRelay(i, relay);

		if (LOG) { console.log(attenuationLoop);}
		//attenuation needed ?
		if ( tempRampe >= TEMP_ATTENUATION) {
			attenuationLoop[i]++;
			attenuation = ATTENUATION_SCALE * attenuationLoop[i];			
			attenuationFactor = 1 - attenuation / 100;
			if ( attenuationFactor < 0 ) {
				attenuationFactor = 0;		//OFF the rampe
				attenuation = 100;
			} 
			new_ratio = { blue: Math.round(ratio.blue * attenuationFactor), white: Math.round(ratio.white * attenuationFactor) }; 	//attenuation -10% x nbre fois check
		} else {
			new_ratio = ratio;
			attenuationLoop[i] = 0;		//reinit
		}
		if (DEBUG) { console.log("Atten T° rampe n°"+i+": T° rampe:"+tempRampe+" (max:"+TEMP_ATTENUATION+") Attenuation: "+attenuation+"%"); }
		if (DEBUG) { console.log('Ratio new',new_ratio); }
		if (LOG) { console.log("T° rampe n°"+i+": "+tempRampe+"° Fan: "+relay+" ("+TEMP_FAN+"°) Atten.: "+attenuation+"% ("+TEMP_ATTENUATION+"°)");  }
		//set pwm & socket web
		setPwmRampe(pwm, i, new_ratio);

		var infos = now_hour;
		infos += " ("+tp.tp1.hour+"-"+tp.tp2.hour+") ";
		infos += " [B:"+tp.tp1.blue +"%-"+tp.tp2.blue+"% W:"+tp.tp1.white +"%-"+tp.tp2.white+"%]";
		//infos += " [ blue:"+new_ratio.blue+"%, white:"+new_ratio.white+"% ]";
		manageWebRampeRatio(io.sockets, i, new_ratio, {temp: tempRampe, relay: relay, attenuation: attenuation, infos: infos});	//io.sockets ? (seems ok)
	}

	return ratio;
}

//init
var ratio = manageAutoAllRampes();
if (DEBUG) { console.log('Init Ratio', ratio); }

//every minute
setInterval(function() {
	ratio = manageAutoAllRampes();
	if (DEBUG) { console.log('setInterval Ratio', ratio); }
}, CHECK_PERIOD * 1000); // 60 * 1000 milsec
if (LOG) { console.log("Running every "+CHECK_PERIOD+" seconds"); }

//on socket ready
io.sockets.on('connection', function (socket) {
	if (DEBUG) { console.log('Socket connection'); }
	for (var i=1; i <= NB_RAMPES; i++) {		//8 rampes
		manageWebRampe(socket, pwm, i);			//manual
		//manageWebRampeRatio(socket, i, ratio, {temp:0, relay:0, attenuation:0, infos:"waiting for data ..."});	//auto
		manageWebRelaySwitch(socket, i);
	}
});
if (DEBUG) { console.log("Running web on port 8989"); }
//End main program--- -------------------------------------