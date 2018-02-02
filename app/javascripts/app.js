// Import the page's CSS. Webpack will know what to do with it.
import "../stylesheets/app.css";

// Import libraries we need.
import { default as Web3} from 'web3';
import { default as contract } from 'truffle-contract'
import ecommerce_store_artifacts from '../../build/contracts/EcommerceStore.json'

var EcommerceStore = contract(ecommerce_store_artifacts);

const ipfsAPI = require('ipfs-api');
const ethUtil = require('ethereumjs-util');

const ipfs = ipfsAPI({host: 'localhost', port: '5001', protocol: 'http'});

window.App = {
  start: function() {
    var self = this;

    console.log(web3.currentProvider);
    EcommerceStore.setProvider(web3.currentProvider);
    renderStore();

    var reader;

    $('#product-image').change(e => {
      const file = e.target.files[0];
      reader = new window.FileReader();
      reader.readAsArrayBuffer(file);
    });

    $("#add-item-to-store").submit(function(event) {
      const req = $("#add-item-to-store").serialize();
      let params = JSON.parse('{"' + req.replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g,'":"') + '"}');
      let decodedParams = {}
      Object.keys(params).forEach(function(v) {
        decodedParams[v] = decodeURIComponent(decodeURI(params[v]));
      });
      saveProduct(reader, decodedParams);
      event.preventDefault();
    });

  },
};

function renderStore() {
 EcommerceStore.deployed().then(function(i) {
  i.getProduct.call(7).then(function(p) {
   $("#product-list").append(buildProduct(p));
  });
  i.getProduct.call(8).then(function(p) {
   $("#product-list").append(buildProduct(p));
  });
 });
}

function saveImageOnIpfs(reader) {
  const buffer = Buffer.from(reader.result);
  return ipfs.add(buffer)
  .then(res => {
    console.log('Uploaded image on ipfs: ', res);
    return res[0].hash;
  })
  .catch(err => {
    console.log('failed to upload image');
    console.log(err);
    throw err;
  })
}

function saveTextBlobOnIpfs(blob) {
  const descBuffer = Buffer.from(blob, 'utf-8');
  return ipfs.add(descBuffer)
  .then(res => {
    console.log('Uploaded blob on ipfs: ', res);
    return res[0].hash;
  })
  .catch(err => {
    console.log('failed to upload text');
    console.log(err);
    throw err;
  })
}

function saveProductToBlockchain(params, imageId, descId) {
  console.log('saving product', params);
  let auctionStartTime = Date.parse(params["product-auction-start"]) / 1000;
  let auctionEndTime = auctionStartTime + parseInt(params["product-auction-end"]) * 24 * 60 * 60;

  EcommerceStore.deployed().then(i => {
    i.addProductToStore(
      params['product-name'],
      params['product-category'],
      imageId,
      descId,
      auctionStartTime,
      auctionEndTime,
      web3.toWei(params['production-price'], 'ether'),
      parseInt(params['product-condition']),
      {
        from: web3.eth.accounts[0],
        gas: 440000
      })
    .then(f => {
      console.log('product added:', f);
      $("#msg").show();
      $("#msg").html("Your product was successfully added to your store!");
    })
  });
}

function saveProduct(reader, decodedParams) {
  return saveImageOnIpfs(reader)
  .then(imageId => {
    return saveTextBlobOnIpfs(decodedParams['product-description'])
    .then(descId => saveProductToBlockchain(decodedParams, imageId, descId));
  })
}

function buildProduct(product) {
 let node = $("<div/>");
 node.addClass("col-sm-3 text-center col-margin-bottom-1");
 node.append("<img src='https://ipfs.io/ipfs/" + product[3] + "' width='150px' />");
 node.append("<div>" + product[1]+ "</div>");
 node.append("<div>" + product[2]+ "</div>");
 node.append("<div>" + product[5]+ "</div>");
 node.append("<div>" + product[6]+ "</div>");
 node.append("<div>Ether " + product[7] + "</div>");
 return node;
}

window.addEventListener('load', function() {
  // Checking if Web3 has been injected by the browser (Mist/MetaMask)
  if (false && typeof web3 !== 'undefined') {
    console.warn("Using web3 detected from external source. If you find that your accounts don't appear or you have 0 MetaCoin, ensure you've configured that source properly. If using MetaMask, see the following link. Feel free to delete this warning. :) http://truffleframework.com/tutorials/truffle-and-metamask")
    // Use Mist/MetaMask's provider
    window.web3 = new Web3(web3.currentProvider);
  } else {
    // fallback - use your fallback strategy (local node / hosted node + in-dapp id mgmt / fail)
    window.web3 = new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:8545"));
  }

  App.start();
});
