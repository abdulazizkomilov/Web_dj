(function(app) {

    var cart,storage,utils,http,endpoints,old_data,new_data;

    app.conduit = {
        storage: null,
        utils: null,
        endpoints: null,
        cart: null,
        landing_site: null
    };

    function endpoints() {
        this.post_cart = 'https://conduit.mailchimpapp.com/hooks/bigcommerce/cart/store_twled39nhhpszlb8m677';
        this.track_campaign = 'https://conduit.mailchimpapp.com/hooks/bigcommerce/track_campaign/store_twled39nhhpszlb8m677';
        this.get_cart ='/api/storefront/cart';
        this.get_customer = "/internalapi/v1/checkout/quote?includes=customer";
    };

    function utils() {
        this.hash = function(str, as_string) {
            var i, l, value = 0x811c9dc5;
            for (i = 0, l = str.length; i < l; i++) {
                value ^= str.charCodeAt(i);
                value += (value << 1) + (value << 4) + (value << 7) + (value << 8) + (value << 24);
            }
            return as_string ? ("0000000" + (value >>> 0).toString(16)).substr(-8) : value >>> 0;
        };

        this.objectCombineUnique = function (e) {
            var t = e[0];
            for (var n = 1; n < e.length; n++) {
                var r = e[n];
                for (var i in r) {
                    t[i] = r[i];
                }
            }
            return t;
        };

        this.createDate = function (e, t) {
            if (!e) {
                e = 0;
            }
            var n = new Date;
            var r = t ? n.getDate() - e : n.getDate() + e;
            n.setDate(r);
            return n;
        };
    };

    function storage() {
        var me = this;

        this.get = function (name, default_value) {
            var nameEQ = name + "=";
            var ca = document.cookie.split(';');
            for (var i=0;i < ca.length;i++) {
                var c = ca[i];
                while (c.charAt(0) === ' ') c = c.substring(1,c.length);
                if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length,c.length);
            }
            return default_value;
        };

        this.set = function (name, value, days) {
            var expires;
            var parts = location.host.split('.');
            if (parts.length > 2) {
                parts.shift();
            }
            var domain = '.'+parts.join('.');

            if (days) {
                var date = new Date();
                date.setTime(date.getTime()+(days*24*60*60*1000));
                expires = "; expires="+date.toGMTString();
            } else { expires = ""; }

            document.cookie = name+"="+value+expires+"; path=/; domain="+domain;
        };

        this.expire = function (name) {
            me.set(name, "", -1);
        };
    };

    function http() {
        this.get = function(endpoint, complete) {
            var get = new XMLHttpRequest();
            get.onreadystatechange = function() {
                if (get.readyState === XMLHttpRequest.DONE && get.status === 200) {
                    complete(JSON.parse(get.responseText), get.responseText);
                }
            };
            get.open("GET", window.location.origin.replace('http://', 'https://')+endpoint, true);
            get.setRequestHeader('Accept', 'application/json');
            get.send();
        };
        this.post = function(items, customer) {
            var post = new XMLHttpRequest();
            post.onreadystatechange = function() {
                if (post.readyState === XMLHttpRequest.DONE && post.status === 200) {
                    console.log('cart response', post.responseText);
                }
            };
            post.open("POST", endpoints.post_cart, true);
            post.setRequestHeader('Accept', 'application/json');
            post.setRequestHeader('Content-Type', 'application/json');
            post.setRequestHeader('X-Channel-Name', 'bigcommerce');
            post.send(JSON.stringify({cart: items, customer: customer}));
        };

        this.campaign = function(cid, eid, email) {
            var tracking = new XMLHttpRequest();
            tracking.onreadystatechange = function() {
                if (tracking.readyState === XMLHttpRequest.DONE && tracking.status === 200) {
                    console.log('campaign', tracking.responseText);
                }
            };
            tracking.open("POST", endpoints.track_campaign, true);
            tracking.setRequestHeader('Accept', 'application/json');
            tracking.setRequestHeader('Content-Type', 'application/json');
            tracking.setRequestHeader('X-Channel-Name', 'bigcommerce');
            tracking.send(JSON.stringify({cid: cid, eid: eid, email: email}));
        };
    };

    var get_customer = function(on_complete) {
        http.get(endpoints.get_customer, function(json) {
            try {
                if (!json || !json.data || !json.data.customer || !json.data.customer.email) {
                    return on_complete ? on_complete(null, json) : null;
                }
                var had_customer = app.conduit.cart.customer !== undefined && app.conduit.cart.customer !== null;
                
                app.conduit.cart.customer = json.data.customer;
                
                var customer = json.data.customer;
                var saved_customer_email = app.conduit.storage.get('customer_email');
                var campaign_tracking_id = app.conduit.storage.get('mc_campaign_id', app.conduit.campaign_id);

                app.conduit.storage.set('customer_email', customer.email, 1);

                if (saved_customer_email && saved_customer_email !== customer.email) {
                    customer.previous_email = saved_customer_email;
                }

                if (campaign_tracking_id && campaign_tracking_id.length > 0) {
                    customer.campaign_tracking_id = campaign_tracking_id;
                }
                
                if (app.conduit.landing_site) {
                    customer.landing_site = app.conduit.landing_site;
                }

                if (on_complete) {
                    on_complete(customer, had_customer === false);
                }

            } catch(e) {console.log('customer not found', e);}
        });
    };

    var get_cart = function(on_complete, force_callback) {
        old_data = app.conduit.storage.get('bc_cart_items');
        http.get(endpoints.get_cart, function(json, response) {
            try {
                
                new_data = app.conduit.utils.hash(JSON.stringify(json[0].lineItems), true);
                app.conduit.storage.set('bc_cart_items', new_data, 1);

                if ((force_callback === true && on_complete) || ((old_data !== new_data) && on_complete)) {
                    on_complete(json);
                }

                app.conduit.cart.hash = new_data;
                app.conduit.cart.items = json;
            } catch (e) {console.log('cart items error', e); }
        });
    };

    var on_customer_load = function(customer, force_callback) {
        get_cart(function(cart) {
            http.post(cart, customer);
        }, force_callback);
    };

    function cart() {
        this.items = null;
        this.hash = null;
        this.customer = null;
        this.campaign_id = null;
        this.email_id = null;
    };

    function getQueryStringVars() {
        var e = window.location.search || "";
        var t = [];
        var n = {};
        e = e.substr(1);
        if (e.length) {
            t = e.split("&");
            for (var r in t)
            {
                var i = t[r];
                if(typeof i !== 'string'){continue;}
                var s = i.split("=");
                var o = s[0];
                var u = s[1];
                if (!o.length)continue;
                if (typeof n[o] === "undefined") {
                    n[o] = []
                }
                n[o].push(u)
            }
        }
        return n;
    };

    function ready() {
        
        if (app.location.protocol !== 'https:') {
            return null;
        }

        var qsc = getQueryStringVars();
        storage = new storage();
        utils = new utils();
        http = new http();
        endpoints = new endpoints();
        cart = new cart();

        app.conduit = {
            storage: storage,
            utils: utils,
            endpoints: endpoints,
            query_string: getQueryStringVars,
            cart: cart,
            campaign_id: null,
            landing_site: null,
            submitted: false
        };

        if (qsc.mc_cid !== undefined) {
            app.conduit.campaign_id = qsc.mc_cid[0];
            app.conduit.storage.set("mc_campaign_id", qsc.mc_cid[0], 1);
            console.log('setting campaign id', qsc.mc_cid[0]);
        }

        app.conduit.cart.items = app.conduit.storage.get('bc_cart_items');
        app.conduit.campaign_id = app.conduit.storage.get('mc_campaign_id');
        app.conduit.landing_site = app.conduit.storage.get('landing_site');

        if (!app.conduit.landing_site) {
            app.conduit.storage.set('landing_site', app.conduit.landing_site = document.location.href, 1);
        }

        get_customer(on_customer_load);

        setTimeout(function() { get_customer(on_customer_load); }, 10000);
        
        document.body.onclick = function(e) {
            e = window.event ? event.srcElement: e.target;
            var is_trigger = e.className && (e.className.indexOf('billingButton') != -1 || e.className.indexOf('shippingButton') != -1);
            if (!is_trigger && document.location.href.indexOf('checkout') != -1 && e.type && e.type.indexOf('submit')!=-1) is_trigger = true;
            if (!is_trigger) return;
            get_customer(function(customer) {
                get_cart(function(cart) { http.post(cart, customer); }, true);
            });
        }
    }

    var listen = function (counter) {
        counter++;
        if (document.readyState !== "complete" && counter < 5000) {
            setTimeout(function() { listen(counter); },10);
            return null;
        }
        ready();
    };

    listen(0);
}(this));