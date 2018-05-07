/*
 * OS.js - JavaScript Cloud/Web Desktop Platform
 *
 * Copyright (c) 2011-2018, Anders Evenrud <andersevenrud@gmail.com>
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * @author  Anders Evenrud <andersevenrud@gmail.com>
 * @licence Simplified BSD License
 */

import {ServiceProvider} from '@osjs/common';
import Login from '../login';

const serverAuth = (core, options) => {
  const request = (endpoint, params = {}) => core.request(endpoint, {
    method: 'POST',
    body: JSON.stringify(params)
  }, 'json');

  return {
    login: (values) => request(core.url('/login'), values),
    logout: () =>  request(core.url('/logout'))
  };
};

const localStorageAuth = (core, options) => ({
  login: (values) => Promise.resolve(values)
});

const defaultAdapters = {
  server: serverAuth,
  localStorage: localStorageAuth
};

/**
 * OS.js Auth Service Provider
 *
 * @desc Creates the login prompt and handles authentication flow
 */
export default class AuthServiceProvider extends ServiceProvider {

  constructor(core, args = {}) {
    args = Object.assign({
      ui: core.config('auth.login.ui', {}),
      config: {}
    }, args);

    super(core);

    const adapter = core.config('standalone')
      ? localStorageAuth
      : typeof args.adapter === 'function'
        ? args.adapter
        : defaultAdapters[args.adapter || 'server'];

    this.ui = new Login(core, args.ui);
    this.adapter = Object.assign({
      login: () => Promise.reject(new Error('Not implemented')),
      logout: () => Promise.reject(new Error('Not implemented')),
      init: () => Promise.resolve(true),
      destroy: () => {}
    }, adapter(core, args.config));

    this.callback = function() {};
  }

  /**
   * Initializes authentication
   */
  async init() {
    this.core.singleton('osjs/auth', () => ({
      show: (cb) => this.show(cb),
      login: () => this.login(),
      logout: (reload) => this.logout(reload)
    }));

    this.ui.on('login:post', values => this.login(values));

    await this.adapter.init();
  }

  /**
   * Shows Login UI
   */
  show(cb) {
    this.callback = cb;
    this.ui.init();

    const login = this.core.config('auth.login', {});
    if (login.username && login.password) {
      this.login(login);
    }
  }

  /**
   * Performs a login
   */
  async login(values) {
    this.ui.emit('login:start');

    try {
      const response = await this.adapter.login(values);
      if (!response) {
        return false;
      }

      this.ui.destroy();
      this.callback(response.user);

      return true;
    } catch (e) {
      if (this.core.config('development')) {
        console.warn(e);
      }

      this.ui.emit('login:error', 'Login failed');

      return false;
    } finally {
      this.ui.emit('login:stop');
    }
  }

  /**
   * Performs a logout
   */
  async logout(reload = true) {
    const response = await this.adapter.logout(reload);
    if (!response) {
      return;
    }

    try {
      this.core.destroy();
    } catch (e) {
      console.warn(e);
    }

    // FIXME
    if (reload) {
      setTimeout(() => window.location.reload(), 1);
    }
  }

}
