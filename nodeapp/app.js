const express = require("express");
const path = require("path");
const fs = require("fs");
//const expressSession = require("express-session");
//const ejs = require("ejs");

//BC setup
const {Gateway, Wallets} = require("fabric-networks");
const FabricCAServices = require("fabric-ca-client");

// CA connection
const ccpPath = path.resolve(__dirname, "config", "connection-org1.json");
const ccpJSON = fs.readFileSync(ccpPath, 'utf8');
const ccp = JSON.parse(ccpJSON);

const app = express();

app.set('port', process.env.PORT || 3000);

app.set("views", __dirname+"/views");
app.set("view engine", "ejs");


app.use(express.urlencoded({extended:false}));
app.use(express.json());

app.use("/public", express.static(path.join(__dirname, 'public')));

app.use(expressSession({
    secret: 'secretisnothing',
    resave:true,
    saveUninitialized:true
}));

//Login Routing
app.post("/process/login", (req, res) => {
    console.log('/process/login accessed');

    const paramID = req.body.id;
    const paramPW = req.body.password;

    if(req.session.user) {
        console.log('already login state, redirect product page');
        res.redirect("/public/product.html");
    } else {
        req.session.user = {
            id: paramID,
            name: 'bstudent',
            authorized: true
        };
    }
    
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf8'});
    const context = {userid: paramID, username: "bstudent"};
    req.app.render("login_success", context, (err, html) => {
        if(err){
            console.error("Error in view rendering " + err.stack);
            res.write("<h2> 뷰 랜더링 중 오류 발생 </h2>");
            res.write("<p>"+err.stack+"</p>");
            res.end();
            return;
        }

        console.log("rendered : " + html);
        res.end(html);
    })
});

//Logout Routing
app.get("/process/logout", (req, res) => {
    console.log("/process/logout accessed");

    if(req.session.user){
        console.log("excute logout");
        req.session.destroy((err) => {
            if(err) {throw err;}
            console.log("session delete success and logout");
            res.redirect("/public/login.html")
        });
    } else {
        console.log("not exist login session");
        res.redirect("/public/login.html");
    }
});


// product Routing

app.get("/process/product", (req, res) => {
    console.log("/process/product accessed");

    if(req.session.user) {
        res.redirect("/public/product.html");
    } else {
        res.redirect("/public/login.html");
    }
});

app.listen(app.get('port'), () => {
    console.log("Express server stared : " + app.get('port'));
})