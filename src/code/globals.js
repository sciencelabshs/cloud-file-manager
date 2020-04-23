// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
// global vars

import {polyfill} from 'es6-promise'
import _ from 'lodash'
import $ from 'jquery'
import React from 'react'
import ReactDOM from 'react-dom'
import ReactDOMFactories from 'react-dom-factories'
import createReactClass from 'create-react-class'

polyfill()

global._ = _
global.$ = $
global.React = React
global.ReactDOM = ReactDOM
global.ReactDOMFactories = ReactDOMFactories

// https://reactjs.org/docs/react-without-es6.html
global.createReactClass = createReactClass

// https://reactjs.org/blog/2020/02/26/react-v16.13.0.html#deprecating-reactcreatefactory
global.createReactFactory = type => React.createElement.bind(null, type)

global.createReactClassFactory = classDef => createReactFactory(createReactClass(classDef))
