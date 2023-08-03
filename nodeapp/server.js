const express = require("express");
const path = require("path");
const fs = require("fs");

//BC setup
const {Gateway, Wallets} = require("fabric-network");
const FabricCAServices = require("fabric-ca-client");

// CA connection
const ccpPath = path.resolve(__dirname, "../../..", "fabric-samples", "test-network", "organizations", "peerOrganizations", "org1.example.com", "connection-org1.json");
const ccpJSON = fs.readFileSync(ccpPath, 'utf8');
const ccp = JSON.parse(ccpJSON);

const app = express();

app.set('port', process.env.PORT || 3000);

app.set("views", __dirname+"/views");

app.use(express.urlencoded({extended:false}));
app.use(express.json());


app.use(express.static(path.join(__dirname, 'views')));

//GET "/" route
app.get("/", (req, res) => {
    res.sendFile(__dirname + "index.html");
});

// POST/admin 관리자 등록
app.post("/admin", async(req, res) => {
    const id = req.body.id;
    const pw = req.body.pw;

    console.log("/admin post -", id, pw);

    try {

        //CA Obj 생성과 연결
        const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
        const caTLSCACerts = caInfo.tlsCACerts.pem;

        const ca = new FabricCAServices(caInfo.url, {trustedRoots: caTLSCACerts, verify: false}, caInfo.caName);

        const walletPath = path.join(process.cwd(), "wallet");
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        console.log(`Wallet path: ${walletPath}`);

        const identity = await wallet.get(id);
        if (identity) {
            console.log('An identity for the admin user admin already exists in the wallet');
            const result_obj = JSON.parse('{"result":"failed", "error":"An identity for the admin user admin already exists in the wallet"}');
            res.send(result_obj);
            return;
        }

        // CA 관리자 인증서 등록
        const enrollment = await ca.enroll({ enrollmentID: id, enrollmentSecret: pw});
        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: 'Org1MSP',
            type: 'X.509',
        };
        //관리자 인증서 저장
        await wallet.put(id, x509Identity);

        console.log('Successfully enrolled admin and imported it into the wallet');
        const res_str = `{"result":"success","msg":"Successfully enrolled ${id} in the wallet"}`;
        res.json(JSON.parse(res_str));
    } catch (err) {
        console.log('Failed to enroll admin and imported it into the wallet');
        // const res_str = `{"result":"failed","msg":"Failed to enroll ${id} in the wallet"}`;
        // res.json(JSON.parse(res_str));
        res.send(err);
    }
});

// POST/user 사용자 등록
app.post("/user", async (req, res) => {
    const id = req.body.id;
    const role = req.body.userrole;

    console.log('/user post - ', id, role);
    try {
        //CA obj 생성
        const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
        const caTLSCACerts = caInfo.tlsCACerts.pem;
        const ca = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);
        // 지갑객체 생성과 기등록 admin 인증서 확인
        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        console.log(`Wallet path: ${walletPath}`);
        // 기등록 user있으면 
        // Check to see if we've already enrolled the user.
        const userIdentity = await wallet.get(id); // userid
        if (userIdentity) {
            console.log('An identity for the user ' + id + ' already exists in the wallet');
            const result_obj = JSON.parse('{"result":"fail", "error":"An identity for the user already exists in the wallet"}');
            res.send(result_obj);
            return;
        }
        // Check to see if we've already enrolled the admin user.
        const adminIdentity = await wallet.get('admin');
        if (!adminIdentity) {
            console.log('An identity for the admin user "admin" does not exist in the wallet');
            console.log('Run the enrollAdmin.js application before retrying');
            const result_obj = JSON.parse('{"result":"fail", "error":"An identity for the admin does not exist in the wallet"}');
            res.send(result_obj);
            return;
        }
        // CA에 사용자 인증서 등록
        // build a user object for authenticating with the CA
        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, 'admin');

        // Register the user, enroll the user, and import the new identity into the wallet.
        const secret = await ca.register({
            affiliation: 'org1.department1', // 'org1.department1'
            enrollmentID: id,
            role: role// 'client'
        }, adminUser);
        const enrollment = await ca.enroll({
            enrollmentID: id,
            enrollmentSecret: secret
        });
        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: 'Org1MSP',
            type: 'X.509',
        };
        await wallet.put(id, x509Identity);

        console.log(`Successfully enrolled user ${id} and imported it into the wallet`);
        const res_str = `{"result":"success","msg":"Successfully enrolled ${id} in the wallet"}`
        res.json(JSON.parse(res_str))
    } catch (error) {
        console.log(`Failed to enroll user ${id} and imported it into the wallet`);
        const res_str = `{"result":"failed","msg":"Failed to enroll ${id} in the wallet"}`
        res.json(JSON.parse(res_str))
    }
});

// POST/book/request
app.post("/book/request", async (req, res) => {
    const bookName = req.body.bookName;
    const owner = req.body.owner;
    const renter = req.body.renter;

    console.log('/book/request post - ', bookName, owner);

    try {
        // 인증서 확인
        const walletPath = path.join(process.cwd(),'wallet')
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        console.log(`Wallet path: ${walletPath}`);

        const userIdentity = await wallet.get(renter); // userid
        if (!userIdentity) {
            console.log('An identity for the user ' + renter + ' does not exists in the wallet');
            const result_obj = JSON.parse('{"result":"fail", "error":"An identity for the user does not exists in the wallet"}');
            res.send(result_obj);
            return;
        }
        // GW 연결
        const gateway = new Gateway();
        await gateway.connect(ccp, {wallet, identity: renter, discovery: {enabled:true, asLocalhost:true}});
        // CH 연결
        const network = await gateway.getNetwork('mychannel');
        // CC 연결과 호출
        const contract = network.getContract('solib');

        await contract.submitTransaction("ReqRent", bookName+'_'+owner, renter);

        console.log(`Successfully requested`);
        const res_str = `{"result":"success","msg":"Successfully request"}`
        res.json(JSON.parse(res_str))
    } catch (error) {
        console.log(`Failed to request`);
        const res_str = `{"result":"failed","error":"Failed to request"}`
        res.json(JSON.parse(res_str))
    }

});

// POST/book/rent
app.post("/book/rent", async (req, res) => {
    const bookName = req.body.bookName;
    const owner = req.body.owner;

    console.log('/book/rent post - ', bookName, owner);

    try {
        // 인증서 확인
        const walletPath = path.join(process.cwd(),'wallet')
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        console.log(`Wallet path: ${walletPath}`);

        const userIdentity = await wallet.get(owner); // userid
        if (!userIdentity) {
            console.log('An identity for the user ' + owner + ' does not exists in the wallet');
            const result_obj = JSON.parse('{"result":"fail", "error":"An identity for the user does not exists in the wallet"}');
            res.send(result_obj);
            return;
        }
        // GW 연결
        const gateway = new Gateway();
        await gateway.connect(ccp, {wallet, identity: owner, discovery: {enabled:true, asLocalhost:true}});
        // CH 연결
        const network = await gateway.getNetwork('mychannel');
        // CC 연결과 호출
        const contract = network.getContract('solib');

        await contract.submitTransaction("RentBook", bookName+'_'+owner);

        console.log(`Successfully Rent`);
        const res_str = `{"result":"success","msg":"Successfully rent"}`
        res.json(JSON.parse(res_str))
    } catch (error) {
        console.log(`Failed to rent`);
        const res_str = `{"result":"failed","error":"Failed to rent"}`
        res.json(JSON.parse(res_str))
    }

});

// POST/book/return
app.post("/book/return", async (req, res) => {
    const bookName = req.body.bookName;
    const owner = req.body.owner;

    console.log('/book/rent turn - ', bookName, owner);

    try {
        // 인증서 확인
        const walletPath = path.join(process.cwd(),'wallet')
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        console.log(`Wallet path: ${walletPath}`);

        const userIdentity = await wallet.get(owner); // userid
        if (!userIdentity) {
            console.log('An identity for the user ' + owner + ' does not exists in the wallet');
            const result_obj = JSON.parse('{"result":"fail", "error":"An identity for the user does not exists in the wallet"}');
            res.send(result_obj);
            return;
        }
        // GW 연결
        const gateway = new Gateway();
        await gateway.connect(ccp, {wallet, identity: owner, discovery: {enabled:true, asLocalhost:true}});
        // CH 연결
        const network = await gateway.getNetwork('mychannel');
        // CC 연결과 호출
        const contract = network.getContract('solib');

        await contract.submitTransaction("ReturnBook", bookName+'_'+owner);

        console.log(`Successfully return`);
        const res_str = `{"result":"success","msg":"Successfully return"}`
        res.json(JSON.parse(res_str))
    } catch (error) {
        console.log(`Failed to return`);
        const res_str = `{"result":"failed","error":"Failed to return"}`
        res.json(JSON.parse(res_str))
    }

});

// GET/book/history
app.get('/book/history', async (req, res) => {
    const bookName = req.query.bookName;
    const owner = req.query.owner;

    console.log("/book/history get - ", bookName, owner);
    try {
        // 인증서 확인
        const walletPath = path.join(process.cwd(),'wallet')
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        console.log(`Wallet path: ${walletPath}`);

        const userIdentity = await wallet.get(owner); // userid
        if (!userIdentity) {
            console.log('An identity for the user ' + owner + ' does not exists in the wallet');
            const result_obj = JSON.parse('{"result":"failed", "error":"An identity for the user does not exists in the wallet"}');
            res.send(result_obj);
            return;
        }
        // GW 연결
        const gateway = new Gateway();
        await gateway.connect(ccp, {wallet, identity: owner, discovery: {enabled:true, asLocalhost:true}})
        // CH 연결
        const network = await gateway.getNetwork('mychannel')
        // CC 연결과 호출
        const contract = network.getContract('solib')
        console.log("evaluate Transaction: History");
        const txresult = await contract.evaluateTransaction("History", bookName + "_" + owner);

        await gateway.disconnect();
        console.log(`Successfully query book history`);

        const res_str = `{"result":"success","msg":${txresult}}`
        res.status(200).json(JSON.parse(res_str));
        
    } catch (error) {
        console.log(`Failed to Allquery`);
        const res_str = `{"result":"failed","error":"Failed to bookHistory"}`
        res.json(JSON.parse(res_str))
    }

});

// GET/book/list
app.get('/book/list', async (req, res) => {
    const id = req.query.id;

    console.log("/book/list get - ", id);
    try {
        // 인증서 확인
        const walletPath = path.join(process.cwd(),'wallet')
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        console.log(`Wallet path: ${walletPath}`);

        const userIdentity = await wallet.get(id); // userid
        if (!userIdentity) {
            console.log('An identity for the user ' + id + ' does not exists in the wallet');
            const result_obj = JSON.parse('{"result":"failed", "error":"An identity for the user does not exists in the wallet"}');
            res.send(result_obj);
            return;
        }
        // GW 연결
        const gateway = new Gateway();
        await gateway.connect(ccp, {wallet, identity: id, discovery: {enabled:true, asLocalhost:true}})
        // CH 연결
        const network = await gateway.getNetwork('mychannel')
        // CC 연결과 호출
        const contract = network.getContract('solib')
        console.log("evaluate Transaction: QueryAllBook");
        const txresult = await contract.evaluateTransaction("QueryAllBook");

        await gateway.disconnect();
        console.log(`Successfully query All Book`);

        const res_str = `{"result":"success","msg":${txresult}}`
        res.status(200).json(JSON.parse(res_str));
        
    } catch (error) {
        console.log(`Failed to Allquery`);
        const res_str = `{"result":"failed","error":"Failed to AllQueryBook"}`
        res.json(JSON.parse(res_str))
    }

});

// POST/book 도서 등록
app.post('/book', async (req, res) => {
    const bookName = req.body.bookName;
    const owner = req.body.owner;

    console.log('/book post - ', bookName, owner);

    try {
        // 인증서 확인
        const walletPath = path.join(process.cwd(),'wallet')
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        console.log(`Wallet path: ${walletPath}`);

        const userIdentity = await wallet.get(owner); // userid
        if (!userIdentity) {
            console.log('An identity for the user ' + cert + ' does not exists in the wallet');
            const result_obj = JSON.parse('{"result":"fail", "error":"An identity for the user does not exists in the wallet"}');
            res.send(result_obj);
            return;
        }
        // GW 연결
        const gateway = new Gateway();
        await gateway.connect(ccp, {wallet, identity: owner, discovery: {enabled:true, asLocalhost:true}});
        // CH 연결
        const network = await gateway.getNetwork('mychannel');
        // CC 연결과 호출
        const contract = network.getContract('solib');

        await contract.submitTransaction("RegisterBook", bookName, owner);

        console.log(`Successfully created`);
        const res_str = `{"result":"success","msg":"Successfully created"}`
        res.json(JSON.parse(res_str))
    } catch (error) {
        console.log(`Failed to create`);
        const res_str = `{"result":"failed","error":"Failed to create"}`
        res.json(JSON.parse(res_str))
    }

});

// GET/book 도서 조회
app.get('/book', async (req, res) => {
    const bookName = req.query.bookName;
    const owner = req.query.owner;

    console.log("/book get - ", bookName, owner);
    try {
        // 인증서 확인
        const walletPath = path.join(process.cwd(),'wallet')
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        console.log(`Wallet path: ${walletPath}`);

        const userIdentity = await wallet.get(owner); // userid
        if (!userIdentity) {
            console.log('An identity for the user ' + cert + ' does not exists in the wallet');
            const result_obj = JSON.parse('{"result":"failed", "error":"An identity for the user does not exists in the wallet"}');
            res.send(result_obj);
            return;
        }
        // GW 연결
        const gateway = new Gateway();
        await gateway.connect(ccp, {wallet, identity: owner, discovery: {enabled:true, asLocalhost:true}})
        // CH 연결
        const network = await gateway.getNetwork('mychannel')
        // CC 연결과 호출
        const contract = network.getContract('solib')

        const txresult = await contract.evaluateTransaction("QueryBook", bookName + "_" + owner);

        console.log(`Successfully retrieved`);
        const res_str = `{"result":"success","msg":"Successfully retrieved"}`
        let res_data = JSON.parse(res_str);
        const data = JSON.parse(txresult);
        if(data.state != ""){
            console.log("in state");
            res_data.content = data;
        }
        res.json(res_data);
        
        
        
        
    } catch (error) {
        console.log(`Failed to query`);
        const res_str = `{"result":"failed","error":"Failed to retrieve"}`
        res.json(JSON.parse(res_str))
    }

});

app.listen(app.get('port'), () => {
    console.log("Express server stared : " + app.get('port'));
})