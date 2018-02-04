// Import the page's CSS. Webpack will know what to do with it.
import '../stylesheets/app.css'

// Import libraries we need.
import { default as Web3 } from 'web3'
import { default as contract } from 'truffle-contract'
import ecommerce_store_artifacts from '../../build/contracts/EcommerceStore.json'

const EcommerceStore = contract(ecommerce_store_artifacts)

const ipfsAPI = require('ipfs-api')
const ethUtil = require('ethereumjs-util')

const ipfs = ipfsAPI({ host: 'localhost', port: '5001', protocol: 'http' })

window.App = {
  start: function () {
    const self = this

    console.log(web3.currentProvider)
    EcommerceStore.setProvider(web3.currentProvider)
    renderStore()

    let reader

    $('#product-image').change(e => {
      const file = e.target.files[0]
      reader = new window.FileReader()
      reader.readAsArrayBuffer(file)
    })

    $('#add-item-to-store').submit(function (event) {
      const req = $('#add-item-to-store').serialize()
      let params = JSON.parse('{"' + req.replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g, '":"') + '"}')
      let decodedParams = {}
      Object.keys(params).forEach(function (v) {
        decodedParams[v] = decodeURIComponent(decodeURI(params[v]))
      })
      saveProduct(reader, decodedParams)
      event.preventDefault()
    })

    if ($('#product-details').length > 0) {
      // This is product details page
      let productId = new URLSearchParams(window.location.search).get('id')
      renderProductDetails(productId)
    }

    $('#bidding').submit(function (event) {
      $('#msg').hide()
      let amount = $('#bid-amount').val()
      let sendAmount = $('#bid-send-amount').val()
      let secretText = $('#secret-text').val()
      let sealedBid = '0x' + ethUtil.sha3(web3.toWei(amount, 'ether') + secretText).toString('hex')
      let productId = $('#product-id').val()
      console.log(sealedBid + ' for ' + productId)
      EcommerceStore.deployed().then(function (i) {
        i.bid(parseInt(productId), sealedBid, {
          value: web3.toWei(sendAmount),
          from: web3.eth.accounts[1],
          gas: 440000
        }).then(
          function (f) {
            $('#msg').html('Your bid has been successfully submitted!')
            $('#msg').show()
            console.log('Bid submitted: ' + f)
          }
        )
      })
      event.preventDefault()
    })

    $('#revealing').submit(function (event) {
      $('#msg').hide()
      let amount = $('#actual-amount').val()
      let secretText = $('#reveal-secret-text').val()
      let productId = $('#product-id').val()
      EcommerceStore.deployed().then(function (i) {
        i.revealBid(parseInt(productId), web3.toWei(amount).toString(), secretText, {
          from: web3.eth.accounts[1],
          gas: 440000
        }).then(
          function (f) {
            $('#msg').show()
            $('#msg').html('Your bid has been successfully revealed!')
            console.log('Bid revealed: ' + f)
          }
        )
          .catch(e => {
            console.log('Revealing failed: ', e)
            $('#msg').show()
            $('#msg').html('Reveal failed, make sure you entered the current info')
          })
      })
      event.preventDefault()
    })

    $('#finalize-auction').submit(function (event) {
      $('#msg').hide()
      let productId = $('#product-id').val()
      EcommerceStore.deployed().then(function (i) {
        i.finalizeAuction(parseInt(productId), { from: web3.eth.accounts[2], gas: 4400000 }).then(
          function (f) {
            $('#msg').show()
            $('#msg').html('The auction has been finalized and winner declared.')
            console.log(f)
            location.reload()
          }
        ).catch(function (e) {
          console.log(e)
          $('#msg').show()
          $('#msg').html('The auction can not be finalized by the buyer or seller, only a third party aribiter can finalize it')
        })
      })
      event.preventDefault()
    })

    $('#release-funds').click(function () {
      let productId = new URLSearchParams(window.location.search).get('id')
      EcommerceStore.deployed().then(function (f) {
        $('#msg').html('Your transaction has been submitted. Please wait for few seconds for the confirmation').show()
        console.log(productId)
        f.releaseAmountToSeller(productId, { from: web3.eth.accounts[1], gas: 440000 }).then(function (f) {
          console.log(f)
          location.reload()
        }).catch(function (e) {
          console.log(e)
        })
      })
    })

    $('#refund-funds').click(function () {
      let productId = new URLSearchParams(window.location.search).get('id')
      EcommerceStore.deployed().then(function (f) {
        $('#msg').html('Your transaction has been submitted. Please wait for few seconds for the confirmation').show()
        f.refundAmountToBuyer(productId, { from: web3.eth.accounts[2], gas: 440000 }).then(function (f) {
          console.log(f)
          location.reload()
        }).catch(function (e) {
          console.log(e)
        })
      })

      alert('refund the funds!')
    })
  }
}

function renderProductDetails (productId) {
  EcommerceStore.deployed().then(function (i) {
    i.getProduct.call(productId).then(function (p) {
      console.log(p)
      let content = ''
      ipfs.cat(p[4]).then(function (stream) {
        stream.on('data', function (chunk) {
          // do stuff with this chunk of data
          content += chunk.toString()
          $('#product-desc').append('<div>' + content + '</div>')
        })
      })

      $('#product-image').append('<img src=\'https://ipfs.io/ipfs/' + p[3] + '\' width=\'250px\' />')
      $('#product-price').html(displayPrice(p[7]))
      $('#product-name').html(p[1].name)
      $('#product-auction-end').html(displayEndHours(p[6]))
      $('#product-id').val(p[0])
      $('#desc-status').html(displayStatus(p[8]))

      // display escrow info
      i.escrowInfo.call(productId).then(e => {
        $('#desc-escrow').html(displayEscrow(e))
      })

      $('#revealing, #bidding, #finalize-auction, #escrow-info').hide()
      let currentTime = getCurrentTimeInSeconds()
      if (parseInt(p[8]) == 1) {
        EcommerceStore.deployed().then(function (i) {
          $('#escrow-info').show()
          i.highestBidderInfo.call(productId).then(function (f) {
            if (f[2].toLocaleString() == '0') {
              $('#product-status').html('Auction has ended. No bids were revealed')
            } else {
              $('#product-status').html('Auction has ended. Product sold to ' + f[0] + ' for ' + displayPrice(f[2]) +
                'The money is in the escrow. Two of the three participants (Buyer, Seller and Arbiter) have to ' +
                'either release the funds to seller or refund the money to the buyer')
            }
          })
          i.escrowInfo.call(productId).then(function (f) {
            $('#buyer').html('Buyer: ' + f[0])
            $('#seller').html('Seller: ' + f[1])
            $('#arbiter').html('Arbiter: ' + f[2])
            if (f[3] == true) {
              $('#release-count').html('Amount from the escrow has been released')
            } else {
              $('#release-count').html(f[4] + ' of 3 participants have agreed to release funds')
              $('#refund-count').html(f[5] + ' of 3 participants have agreed to refund the buyer')
            }
          })
        })
      } else if (parseInt(p[8]) == 2) {
        $('#product-status').html('Product was not sold')
      } else if (currentTime < parseInt(p[6])) {
        $('#bidding').show()
      }

      $('#revealing').show()
      $('#finalize-auction').show()
    })
  })
}

function getCurrentTimeInSeconds () {
  return Math.round(new Date() / 1000)
}

function displayEscrow (e) {
  const result = {
    buyer: e[0],
    seller: e[1],
    arbiter: e[2],
    fundsDisbursed: e[3],
    releaseCount: parseInt(e[4]),
    refundCount: parseInt(e[5])
  }

  return JSON.stringify(result)
}

function displayStatus (s) {
  s = parseInt(s)

  if (s === 0) {
    return 'Open'
  } else if (s === 1) {
    return 'Sold'
  } else {
    return 'Unsold'
  }
}

function displayPrice (amt) {
  return 'Ξ' + web3.fromWei(amt, 'ether')
}

function displayEndHours (seconds) {
  let current_time = getCurrentTimeInSeconds()
  let remaining_seconds = seconds - current_time

  if (remaining_seconds <= 0) {
    return 'Auction has ended'
  }

  let days = Math.trunc(remaining_seconds / (24 * 60 * 60))

  remaining_seconds -= days * 24 * 60 * 60
  let hours = Math.trunc(remaining_seconds / (60 * 60))

  remaining_seconds -= hours * 60 * 60

  let minutes = Math.trunc(remaining_seconds / 60)

  if (days > 0) {
    return 'Auction ends in ' + days + ' days, ' + hours + ', hours, ' + minutes + ' minutes'
  } else if (hours > 0) {
    return 'Auction ends in ' + hours + ' hours, ' + minutes + ' minutes '
  } else if (minutes > 0) {
    return 'Auction ends in ' + minutes + ' minutes '
  } else {
    return 'Auction ends in ' + remaining_seconds + ' seconds'
  }
}

function renderStore () {
  EcommerceStore.deployed().then(function (i) {
    i.getProduct.call(2).then(function (p) {
      $('#product-list').append(buildProduct(p))
    })
    i.getProduct.call(1).then(function (p) {
      $('#product-list').append(buildProduct(p))
    })
  })
}

function saveImageOnIpfs (reader) {
  const buffer = Buffer.from(reader.result)
  return ipfs.add(buffer)
    .then(res => {
      console.log('Uploaded image on ipfs: ', res)
      return res[0].hash
    })
    .catch(err => {
      console.log('failed to upload image')
      console.log(err)
      throw err
    })
}

function saveTextBlobOnIpfs (blob) {
  const descBuffer = Buffer.from(blob, 'utf-8')
  return ipfs.add(descBuffer)
    .then(res => {
      console.log('Uploaded blob on ipfs: ', res)
      return res[0].hash
    })
    .catch(err => {
      console.log('failed to upload text')
      console.log(err)
      throw err
    })
}

function saveProductToBlockchain (params, imageId, descId) {
  console.log('saving product', params)
  let auctionStartTime = Date.parse(params['product-auction-start']) / 1000
  let auctionEndTime = auctionStartTime + parseInt(params['product-auction-end']) * 24 * 60 * 60

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
        console.log('product added:', f)
        $('#msg').show()
        $('#msg').html('Your product was successfully added to your store!')
      })
  })
}

function saveProduct (reader, decodedParams) {
  return saveImageOnIpfs(reader)
    .then(imageId => {
      return saveTextBlobOnIpfs(decodedParams['product-description'])
        .then(descId => saveProductToBlockchain(decodedParams, imageId, descId))
    })
}

function buildProduct (product) {
  let node = $('<div/>')
  node.addClass('col-sm-3 text-center col-margin-bottom-1')
  node.append('<img src=\'https://ipfs.io/ipfs/' + product[3] + '\' width=\'150px\' />')
  let nameNode = $('<a/>')
  nameNode.html(product[1])
  nameNode.attr('href', '/product.html?id=' + product[0])
  node.append(nameNode)
  node.append('<div>' + product[2] + '</div>')
  node.append('<div>' + product[5] + '</div>')
  node.append('<div>' + product[6] + '</div>')
  node.append('<div>Ether ' + product[7] + '</div>')
  return node
}

window.addEventListener('load', function () {
  // Checking if Web3 has been injected by the browser (Mist/MetaMask)
  if (false && typeof web3 !== 'undefined') {
    console.warn('Using web3 detected from external source. If you find that your accounts don\'t appear or you have 0 MetaCoin, ensure you\'ve configured that source properly. If using MetaMask, see the following link. Feel free to delete this warning. :) http://truffleframework.com/tutorials/truffle-and-metamask')
    // Use Mist/MetaMask's provider
    window.web3 = new Web3(web3.currentProvider)
  } else {
    // fallback - use your fallback strategy (local node / hosted node + in-dapp id mgmt / fail)
    window.web3 = new Web3(new Web3.providers.HttpProvider('http://127.0.0.1:8545'))
  }

  App.start()
})
